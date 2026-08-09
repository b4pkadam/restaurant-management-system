import type { Order, Notification, AppSettings } from '../types';

interface SyncMessage {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'SETTINGS_UPDATED' | 'REQUEST_INITIAL_SYNC' | 'INITIAL_SYNC_RESPONSE' | 'ORDER_ACK';
  payload: any;
  senderId: string;
}

// Unique ID for this browser session
const SENDER_ID = Math.random().toString(36).substring(2, 10);
const TOPIC = 'restaurant_pos_b4pkadam';
const NTFY_URL = `https://ntfy.sh/${TOPIC}`;
const REST_CLOUD_URL = 'https://api.restful-api.dev/objects';

class RealtimeSyncService {
  private eventSource: EventSource | null = null;
  private isInitialized = false;
  private pollInterval: any = null;
  private processedMessageIds = new Set<string>();
  private pendingOrderAcks = new Map<string, { order: Order; notification?: Notification; retryTimer: any }>();

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.connectStream();
    this.startPolling();

    // Broadcast initial sync request to get active state from online devices
    this.requestInitialSync();
  }

  public requestInitialSync() {
    this.send({
      type: 'REQUEST_INITIAL_SYNC',
      payload: {},
      senderId: SENDER_ID,
    });
  }

  private connectStream() {
    try {
      if (typeof window === 'undefined' || !('EventSource' in window)) return;

      if (this.eventSource) {
        try {
          this.eventSource.close();
        } catch {}
      }

      this.eventSource = new EventSource(`${NTFY_URL}/sse`);

      this.eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'message' && data.message) {
            if (data.id && this.processedMessageIds.has(data.id)) return;
            if (data.id) this.processedMessageIds.add(data.id);

            const msg: SyncMessage = JSON.parse(data.message);
            if (msg && msg.senderId !== SENDER_ID) {
              await this.handleIncomingMessage(msg);
            }
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      this.eventSource.onerror = () => {
        // Reconnect after 2 seconds
        setTimeout(() => this.connectStream(), 2000);
      };
    } catch {
      // Stream fallback handled by polling
    }
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    // Poll endpoints every 2 seconds for recent events
    this.pollInterval = setInterval(() => this.pollEvents(), 2000);
    this.pollEvents();
  }

  private async pollEvents() {
    // 1. Poll ntfy.sh stream
    try {
      const res = await fetch(`${NTFY_URL}/json?poll=1&since=2m`);
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;
          try {
            const data = JSON.parse(line);
            if (data.event === 'message' && data.message) {
              if (data.id && this.processedMessageIds.has(data.id)) continue;
              if (data.id) this.processedMessageIds.add(data.id);

              const msg: SyncMessage = JSON.parse(data.message);
              if (msg && msg.senderId !== SENDER_ID) {
                await this.handleIncomingMessage(msg);
              }
            }
          } catch {}
        }
      }
    } catch {
      // Ignore polling errors
    }
  }

  private send(msg: SyncMessage) {
    const payload = JSON.stringify(msg);

    // 1. Post to ntfy.sh public cloud relay
    fetch(NTFY_URL, {
      method: 'POST',
      body: payload,
    }).catch(() => {});

    // 2. Post to RESTful API Cloud Objects Backup Store for persistent cloud sync
    if (msg.type === 'ORDER_CREATED') {
      fetch(REST_CLOUD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'restaurant_pos_b4pkadam_msg',
          data: msg,
        }),
      }).catch(() => {});
    }

    // 3. Broadcast to local tab/window instances
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('restaurant_db_channel');
        bc.postMessage({ type: 'SYNC_MSG', msg });
        bc.close();
      }
    } catch {}
  }

  private async handleIncomingMessage(message: SyncMessage) {
    // Dynamically import database module to break top-level circular dependency
    const { orderDB, tableDB, notificationDB, settingsDB, notifyDbListeners } = await import('../database/db');

    switch (message.type) {
      case 'ORDER_CREATED': {
        const order: Order = message.payload.order;
        const notif: Notification = message.payload.notification;

        // Send ACK back to mobile sender
        this.send({
          type: 'ORDER_ACK',
          payload: { orderId: order.id },
          senderId: SENDER_ID,
        });

        const existing = orderDB.getById(order.id);
        if (!existing) {
          const orders = orderDB.getAll();
          orders.push(order);
          localStorage.setItem('restaurant_db_orders', JSON.stringify(orders));

          if (order.tableNumber) {
            let t = tableDB.getByNumber(order.tableNumber);
            if (!t) {
              t = tableDB.create({
                number: order.tableNumber,
                capacity: 4,
                status: 'occupied',
                qrCode: `?table=${order.tableNumber}`,
              });
            } else {
              tableDB.update(t.id, { status: 'occupied', currentOrderId: order.id });
            }
          }

          if (notif) {
            const notifications = notificationDB.getAll();
            const existsNotif = notifications.find((n) => n.id === notif.id);
            if (!existsNotif) {
              notifications.unshift(notif);
              localStorage.setItem('restaurant_db_notifications', JSON.stringify(notifications));
            }
          }

          notifyDbListeners();
          this.playAlertSound();
        }
        break;
      }

      case 'ORDER_ACK': {
        const orderId: string = message.payload.orderId;
        if (orderId && this.pendingOrderAcks.has(orderId)) {
          const pending = this.pendingOrderAcks.get(orderId);
          if (pending?.retryTimer) clearInterval(pending.retryTimer);
          this.pendingOrderAcks.delete(orderId);
        }
        break;
      }

      case 'ORDER_UPDATED': {
        const order: Order = message.payload.order;
        const orders = orderDB.getAll();
        const idx = orders.findIndex((o) => o.id === order.id);
        if (idx !== -1) {
          orders[idx] = { ...orders[idx], ...order };
          localStorage.setItem('restaurant_db_orders', JSON.stringify(orders));
          notifyDbListeners();
        }
        break;
      }

      case 'SETTINGS_UPDATED': {
        const settings: AppSettings = message.payload.settings;
        if (settings) {
          localStorage.setItem('restaurant_db_settings', JSON.stringify(settings));
          notifyDbListeners();
        }
        break;
      }

      case 'REQUEST_INITIAL_SYNC': {
        const activeOrders = orderDB.getActive();
        const currentSettings = settingsDB.get();

        // Compress active orders to prevent HTTP size limits
        const compressedOrders = activeOrders.map((o) => ({
          ...o,
          items: o.items.map((i) => ({
            id: i.id,
            menuItemId: i.menuItemId,
            menuItemName: i.menuItemName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
            status: i.status || 'pending',
          })),
        }));

        this.send({
          type: 'INITIAL_SYNC_RESPONSE',
          payload: { orders: compressedOrders, settings: currentSettings },
          senderId: SENDER_ID,
        });
        break;
      }

      case 'INITIAL_SYNC_RESPONSE': {
        const remoteOrders: Order[] = message.payload.orders || [];
        const remoteSettings: AppSettings = message.payload.settings;

        if (remoteSettings) {
          localStorage.setItem('restaurant_db_settings', JSON.stringify(remoteSettings));
        }

        if (remoteOrders.length > 0) {
          const localOrders = orderDB.getAll();
          let updated = false;

          remoteOrders.forEach((ro) => {
            const idx = localOrders.findIndex((lo) => lo.id === ro.id);
            if (idx === -1) {
              localOrders.push(ro);
              updated = true;
            } else if (new Date(ro.createdAt).getTime() > new Date(localOrders[idx].createdAt).getTime()) {
              localOrders[idx] = ro;
              updated = true;
            }
          });

          if (updated) {
            localStorage.setItem('restaurant_db_orders', JSON.stringify(localOrders));
          }
        }

        notifyDbListeners();
        break;
      }
    }
  }

  private playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio autoplay blocked
    }
  }

  public broadcastOrderCreated(order: Order, notification?: Notification) {
    // Compress order item fields to guarantee fast, lightweight transmission for bulk orders
    const compressedOrder: Order = {
      ...order,
      items: order.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        menuItemName: i.menuItemName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        status: i.status || 'pending',
      })),
    };

    const msg: SyncMessage = {
      type: 'ORDER_CREATED',
      payload: { order: compressedOrder, notification },
      senderId: SENDER_ID,
    };

    this.send(msg);

    // Guaranteed ACK retry loop: retry sending every 1.5s until ACK is received from Desktop PC
    let attempts = 0;
    const retryTimer = setInterval(() => {
      attempts++;
      if (attempts > 15 || !this.pendingOrderAcks.has(order.id)) {
        clearInterval(retryTimer);
        this.pendingOrderAcks.delete(order.id);
        return;
      }
      this.send(msg);
    }, 1500);

    this.pendingOrderAcks.set(order.id, { order, notification, retryTimer });
  }

  public broadcastOrderUpdated(order: Order) {
    const compressedOrder: Order = {
      ...order,
      items: order.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        menuItemName: i.menuItemName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
        status: i.status || 'pending',
      })),
    };

    this.send({
      type: 'ORDER_UPDATED',
      payload: { order: compressedOrder },
      senderId: SENDER_ID,
    });
  }

  public broadcastSettingsUpdated(settings: AppSettings) {
    this.send({
      type: 'SETTINGS_UPDATED',
      payload: { settings },
      senderId: SENDER_ID,
    });
  }
}

export const realtimeSync = new RealtimeSyncService();

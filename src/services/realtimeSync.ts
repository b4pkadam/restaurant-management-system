import type { Order, Notification, AppSettings } from '../types';

interface SyncMessage {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'SETTINGS_UPDATED';
  payload: any;
  senderId: string;
}

const SENDER_ID = Math.random().toString(36).substring(2, 10);
const CHANNEL = 'restaurant_pos_b4pkadam';
const PUB_URL = `https://ps.pubnub.com/publish/demo/demo/0/${CHANNEL}/0/`;
const HIST_URL = `https://ps.pubnub.com/v2/history/sub-key/demo/channel/${CHANNEL}?count=30`;

class RealtimeSyncService {
  private isInitialized = false;
  private pollInterval: any = null;
  private processedTimestamps = new Set<string>();

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.startPolling();
    this.listenLocalBroadcast();
  }

  private listenLocalBroadcast() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('restaurant_db_channel');
        bc.onmessage = async (e) => {
          if (e.data && e.data.type === 'SYNC_MSG' && e.data.msg) {
            const msg: SyncMessage = e.data.msg;
            if (msg.senderId !== SENDER_ID) {
              await this.handleIncomingMessage(msg);
            }
          }
        };
      }
    } catch {}
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    // Poll PubNub cloud history every 1.5 seconds for cross-device updates
    this.pollInterval = setInterval(() => this.pollCloudHistory(), 1500);
    this.pollCloudHistory();
  }

  private async pollCloudHistory() {
    try {
      const res = await fetch(HIST_URL);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) return;

      const messages = data[0];
      const startTimetoken = data[1] ? String(data[1]) : '';
      const endTimetoken = data[2] ? String(data[2]) : '';

      for (let i = 0; i < messages.length; i++) {
        const msg: SyncMessage = messages[i];
        if (!msg || typeof msg !== 'object') continue;

        // Generate unique message identifier using senderId + type + order/settings id
        let msgKey = `${msg.senderId}_${msg.type}`;
        if (msg.payload) {
          if (msg.payload.order?.id) msgKey += `_${msg.payload.order.id}_${msg.payload.order.status}`;
          if (msg.payload.settings?.updatedAt) msgKey += `_${msg.payload.settings.updatedAt}`;
        }

        if (this.processedTimestamps.has(msgKey)) continue;
        this.processedTimestamps.add(msgKey);

        if (msg.senderId !== SENDER_ID) {
          await this.handleIncomingMessage(msg);
        }
      }
    } catch {
      // Ignore network polling glitches
    }
  }

  private sendToCloud(msg: SyncMessage) {
    const jsonStr = JSON.stringify(msg);

    // 1. Publish to PubNub High-Availability Cloud Relay
    fetch(PUB_URL + encodeURIComponent(jsonStr)).catch(() => {});

    // 2. Broadcast to local tab/window instances
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
        const order: Order = message.payload?.order;
        const notif: Notification = message.payload?.notification;

        if (!order || !order.id) return;

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

      case 'ORDER_UPDATED': {
        const order: Order = message.payload?.order;
        if (!order || !order.id) return;

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
        const settings: AppSettings = message.payload?.settings;
        if (settings && settings.currency) {
          localStorage.setItem('restaurant_db_settings', JSON.stringify(settings));
          notifyDbListeners();
        }
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
    this.sendToCloud(msg);
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

    const msg: SyncMessage = {
      type: 'ORDER_UPDATED',
      payload: { order: compressedOrder },
      senderId: SENDER_ID,
    };
    this.sendToCloud(msg);
  }

  public broadcastSettingsUpdated(settings: AppSettings) {
    const msg: SyncMessage = {
      type: 'SETTINGS_UPDATED',
      payload: { settings: { ...settings, updatedAt: new Date().toISOString() } },
      senderId: SENDER_ID,
    };
    this.sendToCloud(msg);
  }
}

export const realtimeSync = new RealtimeSyncService();

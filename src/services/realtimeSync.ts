import type { Order, Notification, AppSettings, Table } from '../types';

interface SyncMessage {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_DELETED' | 'SETTINGS_UPDATED' | 'WAITER_CALLED' | 'TABLE_UPDATED';
  payload: any;
  senderId: string;
}

const SENDER_ID = Math.random().toString(36).substring(2, 10);
const CHANNEL = 'restaurant_pos_b4pkadam';
const PUB_URL = `https://ps.pubnub.com/publish/demo/demo/0/${CHANNEL}/0/`;
const HIST_URL = `https://ps.pubnub.com/v2/history/sub-key/demo/channel/${CHANNEL}?count=30`;

class RealtimeSyncService {
  private isInitialized = false;
  private isFirstPoll = true;
  private startupTime = Date.now();
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
              await this.handleIncomingMessage(msg, false);
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

      for (let i = 0; i < messages.length; i++) {
        const msg: SyncMessage = messages[i];
        if (!msg || typeof msg !== 'object') continue;

        // Generate unique message identifier using senderId + type + order/settings id
        let msgKey = `${msg.senderId}_${msg.type}`;
        if (msg.payload) {
          if (msg.payload.order?.id) msgKey += `_${msg.payload.order.id}_${msg.payload.order.status}`;
          if (msg.payload.settings?.updatedAt) msgKey += `_${msg.payload.settings.updatedAt}`;
          if (msg.payload.tableNumber) msgKey += `_${msg.payload.tableNumber}_${msg.payload.timestamp || ''}`;
          if (msg.payload.table) {
            msgKey += `_${msg.payload.table.id || msg.payload.table.number}_${msg.payload.table.status}_${msg.payload.table.updatedAt || ''}`;
          }
        }

        if (this.processedTimestamps.has(msgKey)) continue;
        this.processedTimestamps.add(msgKey);

        if (msg.senderId !== SENDER_ID) {
          await this.handleIncomingMessage(msg, this.isFirstPoll);
        }
      }
      this.isFirstPoll = false;
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

  private async handleIncomingMessage(message: SyncMessage, isInitialSync = false) {
    // Dynamically import database module to break top-level circular dependency
    const { orderDB, tableDB, notificationDB, settingsDB, notifyDbListeners, setCollection } = await import('../database/db');

    switch (message.type) {
      case 'TABLE_UPDATED': {
        const table: Table = message.payload?.table;
        if (!table || (!table.id && !table.number)) return;

        const tables = tableDB.getAll();
        const idx = tables.findIndex(
          (t) =>
            t.id === table.id ||
            t.number === table.number ||
            `table_${t.number}` === table.id ||
            `table_${table.number}` === t.id
        );
        if (idx !== -1) {
          tables[idx] = { ...tables[idx], ...table };
        } else {
          tables.push(table);
        }
        setCollection('tables', tables);
        notifyDbListeners();
        break;
      }

      case 'ORDER_CREATED': {
        const order: Order = message.payload?.order;
        const notif: Notification = message.payload?.notification;

        if (!order || !order.id) return;

        const existing = orderDB.getById(order.id);
        if (!existing) {
          const orders = orderDB.getAll();
          orders.push(order);
          setCollection('orders', orders);

          if (order.tableNumber) {
            const t = tableDB.getByNumber(order.tableNumber);
            if (t) {
              tableDB.update(t.id, { status: 'occupied', currentOrderId: order.id });
            }
          }

          if (notif) {
            const notifications = notificationDB.getAll();
            const existsNotif = notifications.find((n) => n.id === notif.id);
            if (!existsNotif) {
              notifications.unshift(notif);
              setCollection('notifications', notifications);
            }
          }

          notifyDbListeners();
          if (!isInitialSync) {
            this.playAlertSound();
          }
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
          setCollection('orders', orders);

          // If order is completed or cancelled, automatically free up the associated table
          if (['completed', 'cancelled'].includes(order.status)) {
            const targetTableId = order.tableId;
            const targetTableNumber = order.tableNumber;
            if (targetTableId) {
              const tbl = tableDB.getById(targetTableId);
              if (tbl && (!tbl.currentOrderId || tbl.currentOrderId === order.id)) {
                tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
              }
            } else if (targetTableNumber) {
              const tbl = tableDB.getByNumber(targetTableNumber);
              if (tbl && (!tbl.currentOrderId || tbl.currentOrderId === order.id)) {
                tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
              }
            }
          }

          notifyDbListeners();
          if (!isInitialSync) {
            this.playAlertSound();
          }
        }
        break;
      }

      case 'ORDER_DELETED': {
        const orderId: string = message.payload?.orderId;
        if (!orderId) return;

        const orders = orderDB.getAll();
        const filtered = orders.filter((o) => o.id !== orderId);
        if (filtered.length !== orders.length) {
          setCollection('orders', filtered);
          notifyDbListeners();
        }
        break;
      }

      case 'WAITER_CALLED': {
        const { tableNumber, message: waiterMsg, timestamp } = message.payload || {};
        if (!tableNumber) return;

        // Strictly ignore stale or historical waiter calls on reload or if older than 25 seconds
        const isFresh = timestamp ? (Date.now() - timestamp < 25000 && timestamp >= this.startupTime - 3000) : false;
        if (isInitialSync || !isFresh) {
          return;
        }

        const notifications = notificationDB.getAll();
        const notifTitle = `🔔 Table ${tableNumber} Calling Waiter!`;
        const existsNotif = notifications.find(
          (n) => n.type === 'table' && n.title === notifTitle && (Date.now() - new Date(n.createdAt).getTime() < 30000)
        );

        if (!existsNotif) {
          notificationDB.create({
            type: 'table',
            title: notifTitle,
            message: waiterMsg || `Table ${tableNumber} has requested immediate waiter service / assistance.`,
          });
          notifyDbListeners();
          this.playWaiterCallSound();
        }
        break;
      }

      case 'SETTINGS_UPDATED': {
        const settings: AppSettings = message.payload?.settings;
        if (settings && settings.currency) {
          settingsDB.update(settings);
          notifyDbListeners();
        }
        break;
      }
    }
  }

  public playWaiterCallSound() {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, startOffset: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startOffset);
        gain.gain.setValueAtTime(0.4, audioCtx.currentTime + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startOffset + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + startOffset);
        osc.stop(audioCtx.currentTime + startOffset + duration);
      };

      // 3-tone chime for waiter call
      playTone(784, 0, 0.2);       // G5
      playTone(987.77, 0.18, 0.2);  // B5
      playTone(1318.5, 0.36, 0.45); // E6
    } catch {
      // Autoplay policy
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

  public broadcastWaiterCall(tableNumber: number, message?: string) {
    const msg: SyncMessage = {
      type: 'WAITER_CALLED',
      payload: {
        tableNumber,
        message: message || `Table ${tableNumber} requested waiter service.`,
        timestamp: Date.now(),
      },
      senderId: SENDER_ID,
    };
    this.sendToCloud(msg);
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
        spiceLevel: i.spiceLevel,
        selectedDrink: i.selectedDrink,
        notes: i.notes,
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
        spiceLevel: i.spiceLevel,
        selectedDrink: i.selectedDrink,
        notes: i.notes,
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

  public broadcastOrderDeleted(orderId: string) {
    const msg: SyncMessage = {
      type: 'ORDER_DELETED',
      payload: { orderId },
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

  public broadcastTableUpdated(table: Table) {
    const msg: SyncMessage = {
      type: 'TABLE_UPDATED',
      payload: { table },
      senderId: SENDER_ID,
    };
    this.sendToCloud(msg);
  }
}

export const realtimeSync = new RealtimeSyncService();

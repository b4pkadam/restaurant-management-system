import type { Order, Notification, AppSettings, Table } from '../types';
import { mergeOrders } from './firebaseSync';

export interface SyncMessage {
  type:
    | 'ORDER_CREATED'
    | 'ORDER_UPDATED'
    | 'ORDER_DELETED'
    | 'SETTINGS_UPDATED'
    | 'WAITER_CALLED'
    | 'TABLE_UPDATED'
    | 'WAITER_CALL_ACKNOWLEDGED';
  payload: any;
  senderId: string;
}

const SENDER_ID = Math.random().toString(36).substring(2, 10);

class RealtimeSyncService {
  private isInitialized = false;
  private startupTime = Date.now();
  private processedMessageKeys = new Set<string>();
  private channel: BroadcastChannel | null = null;

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.listenLocalBroadcast();
  }

  private listenLocalBroadcast() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('restaurant_db_channel');
        this.channel.onmessage = async (e) => {
          if (e.data && e.data.type === 'SYNC_MSG' && e.data.msg) {
            const msg: SyncMessage = e.data.msg;
            if (msg.senderId !== SENDER_ID) {
              await this.processMessage(msg);
            }
          }
        };
      }
    } catch {
      // BroadcastChannel unavailable or restricted
    }
  }

  private sendLocalBroadcast(msg: SyncMessage) {
    try {
      if (this.channel) {
        this.channel.postMessage({ type: 'SYNC_MSG', msg });
      } else if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('restaurant_db_channel');
        bc.postMessage({ type: 'SYNC_MSG', msg });
        bc.close();
      }
    } catch {
      // Ignore broadcast error
    }
  }

  private async processMessage(msg: SyncMessage) {
    if (!msg || typeof msg !== 'object' || !msg.type) return;

    // Deduplicate identical message keys
    let msgKey = `${msg.senderId}_${msg.type}`;
    if (msg.payload) {
      if (msg.payload.order?.id) msgKey += `_${msg.payload.order.id}_${msg.payload.order.status}_${msg.payload.order.updatedAt || ''}`;
      if (msg.payload.tableNumber) msgKey += `_${msg.payload.tableNumber}_${msg.payload.timestamp || ''}`;
      if (msg.payload.table) {
        msgKey += `_${msg.payload.table.id || msg.payload.table.number}_${msg.payload.table.status}_${msg.payload.table.updatedAt || ''}`;
      }
    }

    if (this.processedMessageKeys.has(msgKey)) return;
    this.processedMessageKeys.add(msgKey);

    if (msg.senderId !== SENDER_ID) {
      await this.handleIncomingMessage(msg);
    }
  }

  private async handleIncomingMessage(message: SyncMessage) {
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

        const orders = orderDB.getAll();
        const existingIdx = orders.findIndex((o) => o.id === order.id);
        if (existingIdx === -1) {
          orders.push(order);
          setCollection('orders', orders);
        } else {
          orders[existingIdx] = mergeOrders(orders[existingIdx], order, false);
          setCollection('orders', orders);
        }

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
        this.playAlertSound();
        break;
      }

      case 'ORDER_UPDATED': {
        const order: Order = message.payload?.order;
        if (!order || !order.id) return;

        const orders = orderDB.getAll();
        const idx = orders.findIndex((o) => o.id === order.id);
        if (idx !== -1) {
          const merged = mergeOrders(orders[idx], order, false);
          orders[idx] = merged;
          setCollection('orders', orders);

          // If order is completed or cancelled, automatically free up the associated table
          if (['completed', 'cancelled'].includes(merged.status)) {
            const targetTableId = merged.tableId;
            const targetTableNumber = merged.tableNumber;
            if (targetTableId) {
              const tbl = tableDB.getById(targetTableId);
              if (tbl && (!tbl.currentOrderId || tbl.currentOrderId === merged.id)) {
                tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined, waiterCall: undefined });
              }
            } else if (targetTableNumber) {
              const tbl = tableDB.getByNumber(targetTableNumber);
              if (tbl && (!tbl.currentOrderId || tbl.currentOrderId === merged.id)) {
                tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined, waiterCall: undefined });
              }
            }
          }

          notifyDbListeners();
          this.playAlertSound();
        } else {
          orders.push(order);
          setCollection('orders', orders);
          notifyDbListeners();
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
        const { tableNumber, message: waiterMsg, timestamp, callId } = message.payload || {};
        if (!tableNumber) return;

        // Ignore stale waiter calls older than 45 seconds or prior to app start
        const isFresh = timestamp ? (Date.now() - timestamp < 45000 && timestamp >= this.startupTime - 5000) : false;
        if (!isFresh) {
          return;
        }

        // Update table entity with active waiter call
        const tbl = tableDB.getByNumber(tableNumber);
        if (tbl) {
          tableDB.update(tbl.id, {
            waiterCall: {
              active: true,
              timestamp: timestamp || Date.now(),
              message: waiterMsg || `Table ${tableNumber} requested waiter service.`,
            },
          });
        }

        const notifications = notificationDB.getAll();
        const notifTitle = `🔔 Table ${tableNumber} Calling Waiter!`;
        const existsNotif = notifications.find(
          (n) => n.type === 'table' && n.title === notifTitle && (Date.now() - new Date(n.createdAt).getTime() < 30000)
        );

        if (!existsNotif) {
          notificationDB.create({
            id: callId || `waiter_call_${tableNumber}_${timestamp || Date.now()}`,
            type: 'table',
            tableNumber,
            title: notifTitle,
            message: waiterMsg || `Table ${tableNumber} has requested immediate waiter service / assistance.`,
          });
        }

        notifyDbListeners();
        this.playWaiterCallSound();
        break;
      }

      case 'WAITER_CALL_ACKNOWLEDGED': {
        const { tableNumber } = message.payload || {};
        if (!tableNumber) return;

        // 1. Clear waiterCall on table
        const tbl = tableDB.getByNumber(tableNumber);
        if (tbl && tbl.waiterCall) {
          tableDB.update(tbl.id, { waiterCall: undefined });
        }

        // 2. Mark all notifications for this table as read
        notificationDB.acknowledgeForTable(tableNumber);

        notifyDbListeners();
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
      import('./soundService').then(({ soundService }) => {
        import('../database/db').then(({ settingsDB }) => {
          const settings = settingsDB.get();
          soundService.playWaiterCallAlert(settings?.waiterCallSound, settings?.waiterCallVibration !== false);
        }).catch(() => {
          soundService.playWaiterCallAlert('chime', true);
        });
      }).catch(() => {});
    } catch {
      // Audio autoplay blocked
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

  public broadcastWaiterCall(tableNumber: number, message?: string, timestamp?: number, callId?: string) {
    const ts = timestamp || Date.now();
    const msg: SyncMessage = {
      type: 'WAITER_CALLED',
      payload: {
        tableNumber,
        message: message || `Table ${tableNumber} requested waiter service.`,
        timestamp: ts,
        callId: callId || `waiter_call_${tableNumber}_${ts}`,
      },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastWaiterCallAcknowledged(tableNumber: number) {
    const msg: SyncMessage = {
      type: 'WAITER_CALL_ACKNOWLEDGED',
      payload: {
        tableNumber,
        timestamp: Date.now(),
      },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastOrderCreated(order: Order, notification?: Notification) {
    const msg: SyncMessage = {
      type: 'ORDER_CREATED',
      payload: { order, notification },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastOrderUpdated(order: Order) {
    const msg: SyncMessage = {
      type: 'ORDER_UPDATED',
      payload: { order },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastOrderDeleted(orderId: string) {
    const msg: SyncMessage = {
      type: 'ORDER_DELETED',
      payload: { orderId },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastSettingsUpdated(settings: AppSettings) {
    const msg: SyncMessage = {
      type: 'SETTINGS_UPDATED',
      payload: { settings: { ...settings, updatedAt: new Date().toISOString() } },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }

  public broadcastTableUpdated(table: Table) {
    const msg: SyncMessage = {
      type: 'TABLE_UPDATED',
      payload: { table },
      senderId: SENDER_ID,
    };
    this.sendLocalBroadcast(msg);
  }
}

export const realtimeSync = new RealtimeSyncService();

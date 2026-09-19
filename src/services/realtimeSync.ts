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
    | 'WAITER_CALL_ACKNOWLEDGED'
    | 'SYNC_BATCH';
  payload: any;
  senderId: string;
}

export type ServerConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

const SENDER_ID = Math.random().toString(36).substring(2, 10);
const STORAGE_SERVER_URL_KEY = 'restaurant_sync_server_url';

export function getDefaultServerUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  // Check manual override in localStorage
  try {
    const saved = localStorage.getItem(STORAGE_SERVER_URL_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}

  // If app is opened directly on an IP (e.g. 192.168.1.x:5173), default server is on port 3001
  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('github.io')) {
    return `http://${hostname}:3001`;
  }

  return 'http://localhost:3001';
}

class RealtimeSyncService {
  private isInitialized = false;
  private startupTime = Date.now();
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private processedMessageKeys = new Set<string>();
  private statusListeners = new Set<(status: ServerConnectionStatus) => void>();
  private currentStatus: ServerConnectionStatus = 'disconnected';
  private serverUrl: string = getDefaultServerUrl();

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.serverUrl = this.getEffectiveServerUrl();
    this.connectWebSocket();
    this.listenLocalBroadcast();
  }

  public getEffectiveServerUrl(): string {
    return getDefaultServerUrl();
  }

  public setServerUrl(url: string) {
    const clean = (url || '').trim().replace(/\/+$/, '');
    try {
      if (clean) {
        localStorage.setItem(STORAGE_SERVER_URL_KEY, clean);
      } else {
        localStorage.removeItem(STORAGE_SERVER_URL_KEY);
      }
    } catch {}
    this.serverUrl = clean || getDefaultServerUrl();
    this.reconnect();
  }

  public getConnectionStatus(): ServerConnectionStatus {
    return this.currentStatus;
  }

  public subscribeStatus(cb: (status: ServerConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.currentStatus);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private setStatus(status: ServerConnectionStatus) {
    this.currentStatus = status;
    this.statusListeners.forEach((cb) => {
      try {
        cb(status);
      } catch {}
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-server-status', { detail: { status } }));
    }
  }

  public reconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectWebSocket();
  }

  private getWebSocketUrl(): string {
    const base = this.serverUrl || getDefaultServerUrl();
    if (base.startsWith('https://')) {
      return base.replace('https://', 'wss://') + '/ws';
    }
    if (base.startsWith('http://')) {
      return base.replace('http://', 'ws://') + '/ws';
    }
    return `ws://${base}/ws`;
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;

    this.setStatus('connecting');
    const wsUrl = this.getWebSocketUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus('connected');
        console.log(`[RealtimeSync] Connected to dedicated sync server: ${wsUrl}`);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'SYNC_BATCH' && Array.isArray(data.payload?.messages)) {
            for (const m of data.payload.messages) {
              await this.processMessage(m, true);
            }
          } else if (data && data.type) {
            await this.processMessage(data, false);
          }
        } catch {
          // ignore malformed frame
        }
      };

      this.ws.onerror = () => {
        this.setStatus('error');
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };
    } catch {
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 4000);
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

  private async processMessage(msg: SyncMessage, isCatchup = false) {
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
      await this.handleIncomingMessage(msg, isCatchup);
    }
  }

  private sendToCloud(msg: SyncMessage) {
    const jsonStr = JSON.stringify(msg);

    // 1. Send via WebSocket if open
    let sentViaWs = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(jsonStr);
        sentViaWs = true;
      } catch {}
    }

    // 2. HTTP POST fallback/redundancy to ensure delivery
    const httpBase = this.serverUrl || getDefaultServerUrl();
    const httpEndpoint = httpBase.replace(/\/+$/, '') + '/api/sync';
    fetch(httpEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
    }).catch(() => {
      // Offline / server unreachable
    });

    // 3. Broadcast to local tab/window instances
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
        if (!isInitialSync) {
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
          if (!isInitialSync) {
            this.playAlertSound();
          }
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

        // Strictly ignore stale or historical waiter calls on reload or if older than 45 seconds
        const isFresh = timestamp ? (Date.now() - timestamp < 45000 && timestamp >= this.startupTime - 5000) : false;
        if (isInitialSync || !isFresh) {
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
    this.sendToCloud(msg);
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
    this.sendToCloud(msg);
  }

  public broadcastOrderCreated(order: Order, notification?: Notification) {
    const msg: SyncMessage = {
      type: 'ORDER_CREATED',
      payload: { order, notification },
      senderId: SENDER_ID,
    };
    this.sendToCloud(msg);
  }

  public broadcastOrderUpdated(order: Order) {
    const msg: SyncMessage = {
      type: 'ORDER_UPDATED',
      payload: { order },
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

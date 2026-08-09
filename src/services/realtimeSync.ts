import { orderDB, tableDB, notificationDB, settingsDB, notifyDbListeners } from '../database/db';
import type { Order, Table, Notification } from '../types';

interface SyncMessage {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'TABLE_UPDATED' | 'REQUEST_INITIAL_SYNC' | 'INITIAL_SYNC_RESPONSE';
  payload: any;
  senderId: string;
}

// Unique ID for this browser session
const SENDER_ID = Math.random().toString(36).substring(2, 10);

class RealtimeSyncService {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectTimer: any = null;

  public init() {
    this.connect();
  }

  private connect() {
    try {
      // Free public WebSockets relay broker for real-time cross-device communication
      const settings = settingsDB.get();
      const channelName = encodeURIComponent((settings.restaurantName || 'default').toLowerCase().replace(/\s+/g, '_'));
      
      // Use PieSocket / Public WebSocket fallback relay
      const wsUrl = `wss://free.piesocket.com/v3/${channelName}?api_key=VC5my8yAODEYUZWOjJVZ6OSi8aIc2kaXAkySubBu&notify_self=0`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        // Request existing active orders from other online devices
        this.send({
          type: 'REQUEST_INITIAL_SYNC',
          payload: {},
          senderId: SENDER_ID,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SyncMessage = JSON.parse(event.data);
          if (message.senderId === SENDER_ID) return; // Ignore self messages

          this.handleIncomingMessage(message);
        } catch {
          // Ignore invalid JSON
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private send(msg: SyncMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // Send error
      }
    }
  }

  private handleIncomingMessage(message: SyncMessage) {
    switch (message.type) {
      case 'ORDER_CREATED': {
        const order: Order = message.payload.order;
        const notif: Notification = message.payload.notification;

        // Upsert order locally without triggering another send
        const existing = orderDB.getById(order.id);
        if (!existing) {
          const orders = orderDB.getAll();
          orders.push(order);
          localStorage.setItem('restaurant_db_orders', JSON.stringify(orders));

          // Auto-link table
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
            notifications.push(notif);
            localStorage.setItem('restaurant_db_notifications', JSON.stringify(notifications));
          }

          notifyDbListeners();

          // Play notification chime on staff PC if available
          this.playAlertSound();
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

      case 'REQUEST_INITIAL_SYNC': {
        // Send back current active orders to the newly connected device
        const activeOrders = orderDB.getActive();
        this.send({
          type: 'INITIAL_SYNC_RESPONSE',
          payload: { orders: activeOrders },
          senderId: SENDER_ID,
        });
        break;
      }

      case 'INITIAL_SYNC_RESPONSE': {
        const remoteOrders: Order[] = message.payload.orders || [];
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
            notifyDbListeners();
          }
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
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5 note
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

  // Public methods to broadcast actions across physical devices
  public broadcastOrderCreated(order: Order, notification?: Notification) {
    this.send({
      type: 'ORDER_CREATED',
      payload: { order, notification },
      senderId: SENDER_ID,
    });
  }

  public broadcastOrderUpdated(order: Order) {
    this.send({
      type: 'ORDER_UPDATED',
      payload: { order },
      senderId: SENDER_ID,
    });
  }
}

export const realtimeSync = new RealtimeSyncService();

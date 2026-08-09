import type { Order, Notification, AppSettings } from '../types';

interface SyncMessage {
  type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'SETTINGS_UPDATED';
  payload: any;
  senderId: string;
}

const SENDER_ID = Math.random().toString(36).substring(2, 10);
const APP_TAG = 'restaurant_b4pkadam';
const CLOUD_URL = 'https://api.restful-api.dev/objects';

class RealtimeSyncService {
  private isInitialized = false;
  private pollInterval: any = null;
  private processedCloudIds = new Set<string>();

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
    // Poll Cloud REST DB every 2 seconds for cross-device updates
    this.pollInterval = setInterval(() => this.pollCloudDB(), 2000);
    this.pollCloudDB();
  }

  private async pollCloudDB() {
    try {
      // Fetch recent objects posted under our app tag
      const res = await fetch(CLOUD_URL);
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;

      for (const item of list) {
        if (!item || !item.name || !item.id || !item.data) continue;
        if (!item.name.startsWith(APP_TAG)) continue;
        if (this.processedCloudIds.has(item.id)) continue;

        this.processedCloudIds.add(item.id);

        const msg: SyncMessage = item.data;
        if (msg && msg.senderId !== SENDER_ID) {
          await this.handleIncomingMessage(msg);
        }
      }
    } catch {
      // Ignore network polling glitches
    }
  }

  private sendToCloud(objectName: string, msg: SyncMessage) {
    // 1. Post to Cloud REST Database
    fetch(CLOUD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${APP_TAG}_${objectName}`,
        data: msg,
      }),
    }).catch(() => {});

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
        const order: Order = message.payload.order;
        const notif: Notification = message.payload.notification;

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
        const order: Order = message.payload.order;
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
        const settings: AppSettings = message.payload.settings;
        if (settings) {
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
    const msg: SyncMessage = {
      type: 'ORDER_CREATED',
      payload: { order, notification },
      senderId: SENDER_ID,
    };
    this.sendToCloud('order', msg);
  }

  public broadcastOrderUpdated(order: Order) {
    const msg: SyncMessage = {
      type: 'ORDER_UPDATED',
      payload: { order },
      senderId: SENDER_ID,
    };
    this.sendToCloud('update', msg);
  }

  public broadcastSettingsUpdated(settings: AppSettings) {
    const msg: SyncMessage = {
      type: 'SETTINGS_UPDATED',
      payload: { settings },
      senderId: SENDER_ID,
    };
    this.sendToCloud('settings', msg);
  }
}

export const realtimeSync = new RealtimeSyncService();

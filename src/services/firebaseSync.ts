import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseActive, setFirebaseConnectionStatus } from './firebase';
import { hasStoredFirebaseConfig } from './firebaseConfig';
import { scrubUserForCloud, hydrateUserFromCloud } from '../utils/cloudCredentials';

export const SYNC_COLLECTIONS = [
  'users',
  'orders',
  'tables',
  'categories',
  'menuItems',
  'inventory',
  'suppliers',
  'purchases',
  'employees',
  'payments',
  'notifications',
  'settings',
] as const;

export interface CloudUpdateHandler {
  setCollection: (collName: string, items: any[]) => void;
  setItem: (collName: string, data: any) => void;
  getCollection: (collName: string) => any[];
  getItem: (collName: string) => any;
  updateDoc?: (collName: string, docId: string, data: any) => void;
  removeDoc?: (collName: string, docId: string) => void;
}

let cloudUpdateHandler: CloudUpdateHandler | null = null;

export function registerCloudUpdateHandler(handler: CloudUpdateHandler): void {
  cloudUpdateHandler = handler;
}

let activeUnsubscribers: Unsubscribe[] = [];
let isSyncingFromCloud = false;
const initializedCollections = new Set<string>();

interface PendingWrite {
  collName: string;
  docId: string;
  data: any;
  timestamp: number;
}
const pendingWrites = new Map<string, PendingWrite>();

export async function flushPendingWrites(): Promise<void> {
  if (pendingWrites.size === 0 || isSyncingFromCloud || !isFirebaseActive()) return;
  const list = Array.from(pendingWrites.values());
  pendingWrites.clear();
  for (const item of list) {
    try {
      await firebaseSync.pushDoc(item.collName, item.docId, item.data);
    } catch {
      // ignore
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('firebase-status-changed', (e: any) => {
    if (e.detail?.status === 'connected') {
      flushPendingWrites().catch(() => {});
    }
  });
}

// Priority ranking for Order and Item status to prevent regressing states during concurrent merges
export const ORDER_STATUS_PRIORITY: Record<string, number> = {
  active: 1,
  preparing: 2,
  ready: 3,
  served: 4,
  completed: 5,
  cancelled: 6,
};

export const ITEM_STATUS_PRIORITY: Record<string, number> = {
  pending: 1,
  preparing: 2,
  ready: 3,
  served: 4,
  cancelled: 5,
};

/**
 * Merge two order item objects safely, preserving advanced statuses, notes, and customizations
 */
function mergeOrderItem(baseItem: any, incomingItem: any): any {
  if (!baseItem) return incomingItem;
  if (!incomingItem) return baseItem;

  const basePriority = ITEM_STATUS_PRIORITY[baseItem.status] || 0;
  const incPriority = ITEM_STATUS_PRIORITY[incomingItem.status] || 0;

  // Decide status: if one is cancelled, only keep cancelled if explicitly marked
  let status = baseItem.status;
  if (incomingItem.status === 'cancelled' || baseItem.status === 'cancelled') {
    status = 'cancelled';
  } else if (incPriority >= basePriority) {
    status = incomingItem.status;
  }

  const quantity = Math.max(Number(baseItem.quantity) || 1, Number(incomingItem.quantity) || 1);
  const unitPrice = Number(incomingItem.unitPrice ?? baseItem.unitPrice ?? 0);
  const totalPrice = quantity * unitPrice;

  return {
    ...baseItem,
    ...incomingItem,
    quantity,
    unitPrice,
    totalPrice,
    status,
    notes: incomingItem.notes || baseItem.notes,
    spiceLevel: incomingItem.spiceLevel || baseItem.spiceLevel,
    selectedDrink: incomingItem.selectedDrink || baseItem.selectedDrink,
  };
}

/**
 * Intelligent entity merger for orders to resolve concurrent edits between multiple terminals
 */
export function mergeOrders(base: any, incoming: any, isOutgoingWrite: boolean = false): any {
  if (!base) return incoming;
  if (!incoming) return base;

  const baseItems: any[] = Array.isArray(base.items) ? base.items : [];
  const incItems: any[] = Array.isArray(incoming.items) ? incoming.items : [];

  // Index items by ID or unique composite key
  const itemMap = new Map<string, any>();
  const getItemKey = (it: any) =>
    it.id || `${it.menuItemId || ''}_${it.selectedDrink || ''}_${it.spiceLevel || ''}_${it.notes || ''}`;

  baseItems.forEach((it) => {
    itemMap.set(getItemKey(it), it);
  });

  incItems.forEach((it) => {
    const key = getItemKey(it);
    const existing = itemMap.get(key);
    if (existing) {
      itemMap.set(key, mergeOrderItem(existing, it));
    } else {
      itemMap.set(key, it);
    }
  });

  const mergedItems = Array.from(itemMap.values());

  // Recalculate subtotal from merged items
  let subtotal = 0;
  mergedItems.forEach((it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unitPrice) || 0;
    it.totalPrice = qty * price;
    if (it.status !== 'cancelled') {
      subtotal += it.totalPrice;
    }
  });

  // Calculate tax & totals
  const baseTaxRate = base.subtotal && base.tax ? base.tax / base.subtotal : 0;
  const incTaxRate = incoming.subtotal && incoming.tax ? incoming.tax / incoming.subtotal : 0;
  const taxRate = incTaxRate || baseTaxRate || 0;
  const tax = Math.round(subtotal * taxRate);
  const discount = incoming.discount !== undefined ? incoming.discount : base.discount || 0;
  const total = Math.max(0, subtotal + tax - discount);

  // Status progression
  const baseStatusPriority = ORDER_STATUS_PRIORITY[base.status] || 0;
  const incStatusPriority = ORDER_STATUS_PRIORITY[incoming.status] || 0;
  let status = base.status;
  if (base.status === 'completed' || incoming.status === 'completed') {
    status = 'completed';
  } else if (incoming.status === 'cancelled' && !isOutgoingWrite) {
    status = 'cancelled';
  } else if (incStatusPriority >= baseStatusPriority) {
    status = incoming.status;
  }

  // Payment status
  const isPaid = Boolean(
    base.isPaid || incoming.isPaid || base.paymentStatus === 'paid' || incoming.paymentStatus === 'paid'
  );
  const paymentStatus = isPaid ? 'paid' : 'pending';

  // Notes merge
  const notes = [base.notes, incoming.notes].filter(Boolean);
  const mergedNotes = Array.from(new Set(notes)).join(' | ') || undefined;

  // Revision and timestamp monotonicity
  const baseRev = typeof base._rev === 'number' ? base._rev : 0;
  const incRev = typeof incoming._rev === 'number' ? incoming._rev : 0;
  const baseUpdated = base.updatedAt ? new Date(base.updatedAt).getTime() : 0;
  const incUpdated = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const incomingIsStrictlyNewer = incRev > baseRev || (incRev === baseRev && incUpdated > baseUpdated);

  return {
    ...base,
    ...incoming,
    items: mergedItems,
    subtotal,
    tax,
    total,
    status,
    isPaid,
    paymentStatus,
    notes: mergedNotes,
    completedAt: status === 'completed' ? (incoming.completedAt || base.completedAt || new Date().toISOString()) : undefined,
    customerName: incoming.customerName || base.customerName,
    customerPhone: incoming.customerPhone || base.customerPhone,
    tableId: incoming.tableId || base.tableId,
    tableNumber: incoming.tableNumber ?? base.tableNumber,
    waiterId: incoming.waiterId || base.waiterId,
    waiterName: incoming.waiterName || base.waiterName,
    _rev: Math.max(baseRev, incRev),
    updatedAt: incomingIsStrictlyNewer
      ? incoming.updatedAt || new Date().toISOString()
      : base.updatedAt || new Date().toISOString(),
  };
}

/**
 * Intelligent entity merger for tables
 */
export function mergeTables(base: any, incoming: any, isOutgoingWrite: boolean = false): any {
  if (!base) return incoming;
  if (!incoming) return base;

  const baseRev = typeof base._rev === 'number' ? base._rev : 0;
  const incRev = typeof incoming._rev === 'number' ? incoming._rev : 0;
  const baseUpdated = base.updatedAt ? new Date(base.updatedAt).getTime() : 0;
  const incUpdated = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const incomingIsStrictlyNewer = incRev > baseRev || (incRev === baseRev && incUpdated > baseUpdated);

  // Determine active order and status
  let currentOrderId = incoming.currentOrderId || base.currentOrderId;
  let status = incoming.status || base.status;

  if (base.currentOrderId && !incoming.currentOrderId) {
    if (isOutgoingWrite || incomingIsStrictlyNewer) {
      currentOrderId = undefined;
      status = incoming.status || 'available';
    } else {
      currentOrderId = base.currentOrderId;
      status = 'occupied';
    }
  } else if (incoming.currentOrderId && !base.currentOrderId) {
    currentOrderId = incoming.currentOrderId;
    status = 'occupied';
  } else if (incomingIsStrictlyNewer || isOutgoingWrite) {
    status = incoming.status || status;
    currentOrderId = incoming.currentOrderId;
  } else if (currentOrderId) {
    status = 'occupied';
  }

  // Waiter call state: preserve incoming if provided, or clear if incoming cleared it
  let waiterCall = incoming.waiterCall;
  if (incoming.waiterCall === undefined && base.waiterCall) {
    if (isOutgoingWrite || incomingIsStrictlyNewer) {
      waiterCall = undefined;
    } else {
      waiterCall = base.waiterCall;
    }
  }

  // An available, cleaning, or reserved table can never retain an active waiter call or past order
  if (status === 'available') {
    currentOrderId = undefined;
    waiterCall = undefined;
  }

  return {
    ...base,
    ...incoming,
    status,
    currentOrderId,
    waiterCall,
    capacity: incoming.capacity || base.capacity,
    qrCode: incoming.qrCode || base.qrCode,
    _rev: Math.max(baseRev, incRev),
    updatedAt: incomingIsStrictlyNewer
      ? incoming.updatedAt || new Date().toISOString()
      : base.updatedAt || new Date().toISOString(),
  };
}

/**
 * High-level entity merger supporting field-level granularity across all collections
 */
export function mergeEntities(
  collName: string,
  base: any,
  incoming: any,
  isOutgoingWrite: boolean = false
): any {
  if (!base) return incoming;
  if (!incoming) return base;

  if (collName === 'orders') {
    return mergeOrders(base, incoming, isOutgoingWrite);
  }

  if (collName === 'tables') {
    return mergeTables(base, incoming, isOutgoingWrite);
  }

  if (collName === 'users') {
    if (isOutgoingWrite) {
      return scrubUserForCloud({ ...base, ...incoming });
    }
    return hydrateUserFromCloud({ ...base, ...incoming }, base);
  }

  // Generic entity field-level merge
  const baseRev = typeof base._rev === 'number' ? base._rev : 0;
  const incRev = typeof incoming._rev === 'number' ? incoming._rev : 0;
  const baseUpdated = base.updatedAt ? new Date(base.updatedAt).getTime() : 0;
  const incUpdated = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const incomingIsNewer = incRev > baseRev || (incRev === baseRev && incUpdated >= baseUpdated);

  const primary = incomingIsNewer ? incoming : base;
  const secondary = incomingIsNewer ? base : incoming;

  const merged: any = { ...secondary };
  for (const key of Object.keys(primary)) {
    if (primary[key] !== undefined) {
      merged[key] = primary[key];
    }
  }

  merged._rev = Math.max(baseRev, incRev);
  merged.updatedAt = incomingIsNewer
    ? incoming.updatedAt || new Date().toISOString()
    : base.updatedAt || new Date().toISOString();

  return merged;
}

/**
 * Recursively prepares an object for Firestore writes.
 * Replaces explicit undefined values with deleteField() so that
 * fields like waiterCall and currentOrderId are actually deleted in the cloud document
 * when cleared instead of being silently skipped by { merge: true }.
 */
export function prepareForFirestore(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data;

  const payload: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) {
      payload[k] = deleteField();
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      payload[k] = prepareForFirestore(v);
    } else {
      payload[k] = v;
    }
  }
  return payload;
}

export const firebaseSync = {
  /**
   * Start real-time Firestore listeners for all collections with granular change processing
   */
  start: (): void => {
    if (!hasStoredFirebaseConfig()) {
      setFirebaseConnectionStatus('disconnected');
      return;
    }

    const db = getFirebaseDb();
    if (!db) {
      setFirebaseConnectionStatus('error', 'Could not access Firestore database.');
      return;
    }

    // Clean up any existing listeners
    firebaseSync.stop();
    setFirebaseConnectionStatus('connecting');

    let listenerErrorFired = false;

    SYNC_COLLECTIONS.forEach((collName) => {
      try {
        const collRef = collection(db, collName);
        const unsub = onSnapshot(
          collRef,
          (snapshot) => {
            // Mark connected on receiving data or empty snapshot
            setFirebaseConnectionStatus('connected');

            if (snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache) {
              // Local change pending cloud write, ignore echo
              return;
            }

            if (snapshot.empty) return;

            isSyncingFromCloud = true;
            try {
              if (collName === 'settings') {
                const settingsDoc = snapshot.docs[0];
                if (settingsDoc && settingsDoc.exists()) {
                  if (cloudUpdateHandler) {
                    cloudUpdateHandler.setItem('settings', settingsDoc.data());
                  }
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'settings' } }));
                }
              } else if (!initializedCollections.has(collName)) {
                // Initial hydration: load baseline snapshot
                initializedCollections.add(collName);
                if (collName === 'tables') {
                  const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
                  const uniqueMap = new Map<number, any>();
                  items.forEach((t: any) => {
                    if (t.number) {
                      if (
                        t.waiterCall &&
                        (!t.waiterCall.active ||
                          t.status === 'available' ||
                          (t.waiterCall.timestamp && Date.now() - t.waiterCall.timestamp > 45000))
                      ) {
                        t.waiterCall = undefined;
                      }
                      if (t.status === 'available') {
                        t.currentOrderId = undefined;
                      }
                      const existing = uniqueMap.get(t.number);
                      if (!existing) {
                        uniqueMap.set(t.number, t);
                      } else {
                        const existingRev = typeof existing._rev === 'number' ? existing._rev : 0;
                        const tRev = typeof t._rev === 'number' ? t._rev : 0;
                        const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
                        const tUpdated = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
                        if (tRev > existingRev || (tRev === existingRev && tUpdated >= existingUpdated)) {
                          uniqueMap.set(t.number, t);
                        }
                      }
                    }
                  });
                  const cleanTables = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.number - b.number);
                  if (cloudUpdateHandler) {
                    cloudUpdateHandler.setCollection('tables', cleanTables);
                  }
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'tables' } }));
                } else if (collName === 'users') {
                  const existingUsers = cloudUpdateHandler?.getCollection('users') || [];
                  const existingMap = new Map(existingUsers.map((u: any) => [u.id, u]));
                  const items = snapshot.docs
                    .map((d) => ({ ...d.data(), id: d.id }))
                    .filter((u: any) => !u.isDeleted)
                    .map((d: any) => hydrateUserFromCloud(d, existingMap.get(d.id)));
                  if (cloudUpdateHandler) {
                    cloudUpdateHandler.setCollection('users', items);
                  }
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'users' } }));
                } else {
                  const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
                  if (cloudUpdateHandler) {
                    cloudUpdateHandler.setCollection(collName, items);
                  }
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: collName } }));
                }
              } else {
                // Incremental Snapshot: Apply granular document changes without replacing entire collection array
                const docChanges = snapshot.docChanges();
                if (docChanges.length > 0 && cloudUpdateHandler) {
                  docChanges.forEach((change) => {
                    const docId = change.doc.id;
                    const data = change.doc.data();
                    if (change.type === 'removed' || (collName === 'users' && data?.isDeleted)) {
                      if (cloudUpdateHandler?.removeDoc) {
                        cloudUpdateHandler.removeDoc(collName, docId);
                      }
                    } else {
                      // 'added' or 'modified'
                      const existingUser = collName === 'users'
                        ? cloudUpdateHandler?.getCollection('users')?.find((u: any) => u.id === docId)
                        : undefined;
                      const hydratedData = collName === 'users'
                        ? hydrateUserFromCloud({ ...data, id: docId }, existingUser)
                        : { ...data, id: docId };

                      if (cloudUpdateHandler?.updateDoc) {
                        cloudUpdateHandler.updateDoc(collName, docId, hydratedData);
                      } else {
                        // Fallback if updateDoc not present
                        const existing = cloudUpdateHandler.getCollection(collName);
                        const idx = existing.findIndex((it: any) => it.id === docId);
                        if (idx >= 0) existing[idx] = hydratedData;
                        else existing.push(hydratedData);
                        cloudUpdateHandler.setCollection(collName, existing);
                      }
                    }
                  });
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: collName } }));
                }
              }
            } finally {
              isSyncingFromCloud = false;
            }
          },
          (error) => {
            console.error(`Firestore listener error on ${collName}:`, error);
            if (!listenerErrorFired) {
              listenerErrorFired = true;
              const errorMsg = error?.message || String(error);
              let friendly = `Firestore listener failed: ${errorMsg}`;

              if (errorMsg.includes('permission-denied') || errorMsg.includes('PERMISSION_DENIED')) {
                friendly = 'Firebase sync stopped: Permission denied. Project may be deleted or Firestore rules reject access.';
              } else if (errorMsg.includes('not-found') || errorMsg.includes('NOT_FOUND') || errorMsg.includes('not found')) {
                friendly = 'Firebase sync stopped: The project does not exist or has been deleted.';
              } else if (errorMsg.includes('unauthenticated')) {
                friendly = 'Firebase sync stopped: Authentication failed.';
              }

              setFirebaseConnectionStatus('error', friendly);
              firebaseSync.stop();
            }
          }
        );

        activeUnsubscribers.push(unsub);
      } catch (err: any) {
        console.warn(`Failed to listen on collection ${collName}:`, err);
        setFirebaseConnectionStatus('error', err?.message || 'Failed to initialize collection listener');
      }
    });
  },

  /**
   * Stop all active Firestore listeners and clear collection hydration state
   */
  stop: (): void => {
    activeUnsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
    activeUnsubscribers = [];
    initializedCollections.clear();
  },

  /**
   * Push a single document create/update to Cloud Firestore with transactional concurrency control
   */
  pushDoc: async (collName: string, docId: string, data: any): Promise<void> => {
    if (isSyncingFromCloud) return;
    if (!isFirebaseActive()) {
      pendingWrites.set(`${collName}_${docId}`, { collName, docId, data, timestamp: Date.now() });
      return;
    }
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const cleanDocId = collName === 'tables' && data?.number ? `table_${data.number}` : docId;
      const cleanData = collName === 'users' ? scrubUserForCloud(data) : data;
      const docRef = doc(db, collName, cleanDocId);
      const now = new Date().toISOString();

      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(docRef);

          if (!snapshot.exists()) {
            // New document: initialize revision metadata
            const cleanPayload = { ...cleanData };
            for (const k of Object.keys(cleanPayload)) {
              if (cleanPayload[k] === undefined) delete cleanPayload[k];
            }
            const payload = {
              ...cleanPayload,
              id: cleanDocId,
              _rev: typeof cleanData._rev === 'number' && cleanData._rev > 0 ? cleanData._rev : 1,
              updatedAt: cleanData.updatedAt || now,
            };
            transaction.set(docRef, payload);
            return;
          }

          // Existing document: perform optimistic concurrency checking & field-level merge
          const cloudData = snapshot.data();
          const merged = mergeEntities(collName, cloudData, cleanData, true);

          const cloudRev = typeof cloudData._rev === 'number' ? cloudData._rev : 0;
          const localRev = typeof cleanData._rev === 'number' ? cleanData._rev : 0;
          const nextRev = Math.max(cloudRev, localRev) + 1;

          const updatedPayload = prepareForFirestore({
            ...merged,
            id: cleanDocId,
            _rev: nextRev,
            updatedAt: now,
          });

          transaction.set(docRef, updatedPayload, { merge: true });
        });
        console.log(`[Cloud Sync] Transactionally pushed ${collName}/${cleanDocId} to Firestore`);
      } catch (txError: any) {
        // Fallback for offline or transaction-incompatible environments
        console.warn(
          `[Cloud Sync] Transaction for ${collName}/${cleanDocId} failed, using optimistic merge fallback:`,
          txError
        );
        const nextRev = (typeof cleanData._rev === 'number' ? cleanData._rev : 0) + 1;
        const fallbackPayload = prepareForFirestore({
          ...cleanData,
          id: cleanDocId,
          _rev: nextRev,
          updatedAt: cleanData.updatedAt || now,
        });
        await setDoc(docRef, fallbackPayload, { merge: true });
      }
    } catch (error: any) {
      console.warn(`Cloud sync failed for ${collName}/${docId}:`, error);
      const msg = error?.message || String(error);
      if (msg.includes('permission-denied') || msg.includes('not-found') || msg.includes('unauthenticated')) {
        setFirebaseConnectionStatus('error', `Cloud write failed: ${msg}`);
        firebaseSync.stop();
      }
    }
  },

  /**
   * Push a document deletion to Cloud Firestore
   */
  deleteDoc: async (collName: string, docId: string): Promise<void> => {
    if (isSyncingFromCloud || !isFirebaseActive()) return;
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const cleanDocId =
        collName === 'tables' && !docId.startsWith('table_') && !isNaN(Number(docId))
          ? `table_${docId}`
          : docId;
      const docRef = doc(db, collName, cleanDocId);
      await deleteDoc(docRef);
      console.log(`[Cloud Sync] Deleted ${collName}/${cleanDocId} from Firestore`);
    } catch (error: any) {
      console.warn(`Cloud delete failed for ${collName}/${docId}:`, error);
      const msg = error?.message || String(error);
      if (msg.includes('permission-denied') || msg.includes('not-found') || msg.includes('unauthenticated')) {
        setFirebaseConnectionStatus('error', `Cloud delete failed: ${msg}`);
        firebaseSync.stop();
      }
    }
  },

  /**
   * Seed / Upload all local data to Firestore in one batch
   */
  uploadLocalDataToCloud: async (): Promise<{ success: boolean; count: number; error?: string }> => {
    if (!hasStoredFirebaseConfig()) {
      return { success: false, count: 0, error: 'No Firebase cloud configuration found. Please enter and save your credentials first.' };
    }

    const db = getFirebaseDb();
    if (!db) {
      setFirebaseConnectionStatus('error', 'Firebase database is not connected.');
      return { success: false, count: 0, error: 'Firebase is not connected' };
    }

    try {
      let totalUploaded = 0;

      for (const collName of SYNC_COLLECTIONS) {
        if (collName === 'settings') {
          const settings = cloudUpdateHandler ? cloudUpdateHandler.getItem('settings') : null;
          if (settings) {
            await setDoc(doc(db, 'settings', 'global_settings'), settings, { merge: true });
            totalUploaded += 1;
          }
        } else {
          const items: any[] = cloudUpdateHandler ? cloudUpdateHandler.getCollection(collName) : [];
          if (Array.isArray(items) && items.length > 0) {
            // Write in batches of 400
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              const slice = items.slice(i, i + 400);
              slice.forEach((item) => {
                let docId = item.id;
                if (collName === 'tables' && item.number) {
                  docId = `table_${item.number}`;
                } else if (!docId) {
                  docId = item.number !== undefined ? String(item.number) : `doc_${Math.random().toString(36).substring(2, 9)}`;
                }
                const docRef = doc(db, collName, docId);
                const now = new Date().toISOString();
                batch.set(
                  docRef,
                  {
                    ...item,
                    id: docId,
                    _rev: typeof item._rev === 'number' && item._rev > 0 ? item._rev : 1,
                    updatedAt: item.updatedAt || now,
                  },
                  { merge: true }
                );
              });
              await batch.commit();
              totalUploaded += slice.length;
            }
          }
        }
      }

      setFirebaseConnectionStatus('connected');
      return { success: true, count: totalUploaded };
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to upload data to Firebase';
      setFirebaseConnectionStatus('error', errMsg);
      return { success: false, count: 0, error: errMsg };
    }
  },
};

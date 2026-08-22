// Real-time Cloud Firestore Two-Way Sync Engine
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb, isFirebaseActive } from './firebase';

const DB_PREFIX = 'restaurant_db_';
const SYNC_COLLECTIONS = [
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

type SyncCollectionName = typeof SYNC_COLLECTIONS[number];

let activeUnsubscribers: Unsubscribe[] = [];
let isSyncingFromCloud = false;

export const firebaseSync = {
  /**
   * Start real-time Firestore listeners for all collections
   */
  start: (): void => {
    if (!isFirebaseActive()) return;
    const db = getFirebaseDb();
    if (!db) return;

    // Clean up any existing listeners
    firebaseSync.stop();

    SYNC_COLLECTIONS.forEach((collName) => {
      try {
        const collRef = collection(db, collName);
        const unsub = onSnapshot(
          collRef,
          (snapshot) => {
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
                  localStorage.setItem(DB_PREFIX + 'settings', JSON.stringify(settingsDoc.data()));
                  window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'settings' } }));
                }
              } else if (collName === 'tables') {
                const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
                const uniqueMap = new Map<number, any>();
                items.forEach((t: any) => {
                  if (t.number) {
                    const existing = uniqueMap.get(t.number);
                    if (!existing || (!existing.currentOrderId && t.currentOrderId)) {
                      uniqueMap.set(t.number, t);
                    }
                  }
                });
                const cleanTables = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.number - b.number);
                localStorage.setItem(DB_PREFIX + 'tables', JSON.stringify(cleanTables));
                window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'tables' } }));
              } else {
                const items = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
                localStorage.setItem(DB_PREFIX + collName, JSON.stringify(items));
                window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: collName } }));
              }
            } finally {
              isSyncingFromCloud = false;
            }
          },
          (error) => {
            console.warn(`Firestore listener error on ${collName}:`, error);
          }
        );

        activeUnsubscribers.push(unsub);
      } catch (err) {
        console.warn(`Failed to listen on collection ${collName}:`, err);
      }
    });
  },

  /**
   * Stop all active Firestore listeners
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
  },

  /**
   * Push a single document create/update to Cloud Firestore
   */
  pushDoc: async (collName: string, docId: string, data: any): Promise<void> => {
    if (isSyncingFromCloud || !isFirebaseActive()) return;
    const db = getFirebaseDb();
    if (!db) return;

    try {
      const cleanDocId = collName === 'tables' && data?.number ? `table_${data.number}` : docId;
      const docRef = doc(db, collName, cleanDocId);
      await setDoc(docRef, { ...data, id: cleanDocId }, { merge: true });
    } catch (error) {
      console.warn(`Cloud sync failed for ${collName}/${docId}:`, error);
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
      const cleanDocId = collName === 'tables' && !docId.startsWith('table_') && !isNaN(Number(docId)) ? `table_${docId}` : docId;
      const docRef = doc(db, collName, cleanDocId);
      await deleteDoc(docRef);
    } catch (error) {
      console.warn(`Cloud delete failed for ${collName}/${docId}:`, error);
    }
  },

  /**
   * Seed / Upload all local data to Firestore in one batch
   */
  uploadLocalDataToCloud: async (): Promise<{ success: boolean; count: number; error?: string }> => {
    const db = getFirebaseDb();
    if (!db) return { success: false, count: 0, error: 'Firebase is not connected' };

    try {
      let totalUploaded = 0;

      for (const collName of SYNC_COLLECTIONS) {
        const raw =
          localStorage.getItem(DB_PREFIX + collName) ||
          localStorage.getItem('restaurant_' + collName);

        if (collName === 'settings') {
          const settings = raw ? JSON.parse(raw) : null;
          if (settings) {
            await setDoc(doc(db, 'settings', 'global_settings'), settings, { merge: true });
            totalUploaded += 1;
          }
        } else if (raw) {
          const items: any[] = JSON.parse(raw);
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
                batch.set(docRef, { ...item, id: docId }, { merge: true });
              });
              await batch.commit();
              totalUploaded += slice.length;
            }
          }
        }
      }

      return { success: true, count: totalUploaded };
    } catch (err: any) {
      return { success: false, count: 0, error: err?.message || 'Failed to upload data to Firebase' };
    }
  },
};

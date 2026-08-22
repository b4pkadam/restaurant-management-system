import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getStoredFirebaseConfig, type FirebaseConfig } from './firebaseConfig';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

export const initFirebase = (customConfig?: FirebaseConfig | null): { app: FirebaseApp | null; db: Firestore | null; isConnected: boolean } => {
  const config = customConfig || getStoredFirebaseConfig();

  if (!config || !config.apiKey || !config.projectId || config.apiKey.includes('dummy')) {
    return { app: null, db: null, isConnected: false };
  }

  try {
    if (getApps().length === 0) {
      appInstance = initializeApp(config);
      try {
        dbInstance = initializeFirestore(appInstance, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        dbInstance = getFirestore(appInstance);
      }
    } else {
      appInstance = getApp();
      dbInstance = getFirestore(appInstance);
    }

    authInstance = getAuth(appInstance);
    storageInstance = getStorage(appInstance);

    return { app: appInstance, db: dbInstance, isConnected: true };
  } catch (error) {
    console.warn('Firebase initialization error:', error);
    return { app: null, db: null, isConnected: false };
  }
};

export const getFirebaseDb = (): Firestore | null => {
  if (!dbInstance) {
    initFirebase();
  }
  return dbInstance;
};

export const getFirebaseAuth = (): Auth | null => {
  if (!authInstance) {
    initFirebase();
  }
  return authInstance;
};

export const getFirebaseStorageService = (): FirebaseStorage | null => {
  if (!storageInstance) {
    initFirebase();
  }
  return storageInstance;
};

export const isFirebaseActive = (): boolean => {
  const config = getStoredFirebaseConfig();
  return Boolean(config && config.apiKey && config.projectId && !config.apiKey.includes('dummy'));
};

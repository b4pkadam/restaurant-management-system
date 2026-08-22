import { initializeApp, getApps, getApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getStoredFirebaseConfig, type FirebaseConfig } from './firebaseConfig';

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

export const resetFirebaseApp = async (): Promise<void> => {
  const apps = getApps();
  for (const app of apps) {
    try {
      await deleteApp(app);
    } catch {
      // ignore
    }
  }
  appInstance = null;
  dbInstance = null;
  authInstance = null;
  storageInstance = null;
};

export const initFirebase = (customConfig?: FirebaseConfig | null): { app: FirebaseApp | null; db: Firestore | null; isConnected: boolean; error?: string } => {
  const config = customConfig || getStoredFirebaseConfig();

  if (!config || !config.apiKey || !config.projectId) {
    return { app: null, db: null, isConnected: false, error: 'API Key and Project ID are required.' };
  }

  if (config.apiKey.includes('dummy') || config.apiKey.length < 20) {
    return { app: null, db: null, isConnected: false, error: 'The provided API Key appears to be invalid or incomplete. Real Google Firebase API keys start with "AIzaSy" and are ~39 characters.' };
  }

  try {
    if (getApps().length === 0) {
      appInstance = initializeApp(config);
      try {
        dbInstance = initializeFirestore(appInstance, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        dbInstance = getFirestore(appInstance);
      }
    } else {
      appInstance = getApp();
      try {
        dbInstance = initializeFirestore(appInstance, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        dbInstance = getFirestore(appInstance);
      }
    }

    authInstance = getAuth(appInstance);
    storageInstance = getStorage(appInstance);

    return { app: appInstance, db: dbInstance, isConnected: true };
  } catch (error: any) {
    console.warn('Firebase initialization error:', error);
    return { app: null, db: null, isConnected: false, error: error?.message || 'Firebase initialization failed' };
  }
};

export const testFirebaseConnection = async (config?: FirebaseConfig | null): Promise<{ success: boolean; message: string }> => {
  const targetConfig = config || getStoredFirebaseConfig();
  if (!targetConfig || !targetConfig.apiKey || !targetConfig.projectId) {
    return { success: false, message: 'Please enter both an API Key and Project ID.' };
  }

  try {
    await resetFirebaseApp();
    const init = initFirebase(targetConfig);
    if (!init.isConnected || !init.db) {
      return { success: false, message: init.error || 'Failed to initialize Firebase with the provided credentials.' };
    }

    // Ping Firestore to test read/write connectivity
    const testCol = collection(init.db, 'settings');
    const q = query(testCol, limit(1));
    await getDocs(q);

    return { success: true, message: '🎉 Connection verified! Firebase Cloud Firestore is live and ready.' };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    if (errorMsg.includes('auth/invalid-api-key') || errorMsg.includes('API key not valid')) {
      return { success: false, message: 'Invalid API Key. Please make sure you copied the full Web API Key (starting with "AIzaSy") from Firebase Console -> Project Settings.' };
    }
    if (errorMsg.includes('not found') || errorMsg.includes('failed-precondition') || errorMsg.includes('Cloud Firestore API is not enabled')) {
      return { success: false, message: 'Firestore Database is not enabled. Go to Firebase Console -> Build -> Firestore Database, and click "Create Database".' };
    }
    if (errorMsg.includes('permission-denied')) {
      return { success: true, message: 'Connected to Firebase! (Note: You may need to set Firestore Security Rules to allow read/write in Firebase Console).' };
    }
    return { success: false, message: `Firebase error: ${errorMsg}` };
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

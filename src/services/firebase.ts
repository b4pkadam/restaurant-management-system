import { initializeApp, getApps, getApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  type Firestore,
  collection,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getStoredFirebaseConfig, hasStoredFirebaseConfig, type FirebaseConfig } from './firebaseConfig';

export type FirebaseConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface FirebaseConnectionState {
  status: FirebaseConnectionStatus;
  errorMessage?: string;
  lastChecked?: number;
  projectId?: string;
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let storageInstance: FirebaseStorage | null = null;

let currentConnectionState: FirebaseConnectionState = {
  status: hasStoredFirebaseConfig() ? 'connecting' : 'disconnected',
  projectId: getStoredFirebaseConfig()?.projectId,
};

const statusSubscribers = new Set<(state: FirebaseConnectionState) => void>();

export const getFirebaseConnectionState = (): FirebaseConnectionState => ({ ...currentConnectionState });

export const setFirebaseConnectionStatus = (
  status: FirebaseConnectionStatus,
  errorMessage?: string
): void => {
  const config = getStoredFirebaseConfig();
  currentConnectionState = {
    status,
    errorMessage: status === 'connected' ? undefined : errorMessage,
    lastChecked: Date.now(),
    projectId: config?.projectId,
  };

  statusSubscribers.forEach((cb) => {
    try {
      cb({ ...currentConnectionState });
    } catch {
      // ignore
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('firebase-status-changed', { detail: { ...currentConnectionState } })
    );
  }
};

export const subscribeFirebaseStatus = (
  callback: (state: FirebaseConnectionState) => void
): (() => void) => {
  statusSubscribers.add(callback);
  callback({ ...currentConnectionState });
  return () => {
    statusSubscribers.delete(callback);
  };
};

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
  setFirebaseConnectionStatus('disconnected');
};

export const initFirebase = (
  customConfig?: FirebaseConfig | null
): { app: FirebaseApp | null; db: Firestore | null; isConnected: boolean; error?: string } => {
  const config = customConfig !== undefined ? customConfig : getStoredFirebaseConfig();

  if (!config || !config.apiKey || !config.projectId) {
    setFirebaseConnectionStatus('disconnected');
    return { app: null, db: null, isConnected: false, error: 'API Key and Project ID are required.' };
  }

  if (config.apiKey.includes('dummy') || config.apiKey.length < 20) {
    const err = 'The provided API Key appears to be invalid or incomplete. Real Google Firebase API keys start with "AIzaSy" and are ~39 characters.';
    setFirebaseConnectionStatus('error', err);
    return { app: null, db: null, isConnected: false, error: err };
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
    const errorMsg = error?.message || 'Firebase initialization failed';
    console.warn('Firebase initialization error:', error);
    setFirebaseConnectionStatus('error', errorMsg);
    return { app: null, db: null, isConnected: false, error: errorMsg };
  }
};

export const checkFirebaseHealth = async (): Promise<{ isConnected: boolean; error?: string }> => {
  const config = getStoredFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    setFirebaseConnectionStatus('disconnected');
    return { isConnected: false };
  }

  setFirebaseConnectionStatus('connecting');

  try {
    const init = initFirebase(config);
    if (!init.isConnected || !init.db) {
      const errMsg = init.error || 'Failed to initialize Firebase with stored configuration.';
      setFirebaseConnectionStatus('error', errMsg);
      return { isConnected: false, error: errMsg };
    }

    // Ping Firestore to test read connectivity
    const testCol = collection(init.db, 'settings');
    const q = query(testCol, limit(1));
    await getDocs(q);

    setFirebaseConnectionStatus('connected');
    return { isConnected: true };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    let friendly = `Firebase connection failed: ${errorMsg}`;

    if (errorMsg.includes('permission-denied') || errorMsg.includes('PERMISSION_DENIED')) {
      friendly = 'Permission Denied: Firebase project was deleted, disabled, or Firestore Security Rules are blocking access.';
    } else if (errorMsg.includes('not-found') || errorMsg.includes('NOT_FOUND') || errorMsg.includes('not found')) {
      friendly = 'Project Not Found: The Firebase project does not exist or has been permanently deleted.';
    } else if (errorMsg.includes('auth/invalid-api-key') || errorMsg.includes('API key not valid')) {
      friendly = 'Invalid API Key: Please verify your Firebase Web API Key.';
    } else if (errorMsg.includes('unavailable') || errorMsg.includes('failed-precondition') || errorMsg.includes('Cloud Firestore API is not enabled')) {
      friendly = 'Cloud Firestore is unavailable, not created, or API is disabled in Firebase Console.';
    }

    setFirebaseConnectionStatus('error', friendly);
    return { isConnected: false, error: friendly };
  }
};

export const testFirebaseConnection = async (
  config?: FirebaseConfig | null
): Promise<{ success: boolean; message: string }> => {
  const targetConfig = config || getStoredFirebaseConfig();
  if (!targetConfig || !targetConfig.apiKey || !targetConfig.projectId) {
    return { success: false, message: 'Please enter both an API Key and Project ID.' };
  }

  try {
    await resetFirebaseApp();
    const init = initFirebase(targetConfig);
    if (!init.isConnected || !init.db) {
      return {
        success: false,
        message: init.error || 'Failed to initialize Firebase with the provided credentials.',
      };
    }

    // Ping Firestore to test read connectivity
    const testCol = collection(init.db, 'settings');
    const q = query(testCol, limit(1));
    await getDocs(q);

    setFirebaseConnectionStatus('connected');
    return { success: true, message: '🎉 Connection verified! Firebase Cloud Firestore is live and ready.' };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    let friendlyMessage = `Firebase error: ${errorMsg}`;

    if (errorMsg.includes('auth/invalid-api-key') || errorMsg.includes('API key not valid')) {
      friendlyMessage = 'Invalid API Key. Please make sure you copied the full Web API Key (starting with "AIzaSy") from Firebase Console -> Project Settings.';
    } else if (errorMsg.includes('not found') || errorMsg.includes('NOT_FOUND') || errorMsg.includes('not-found')) {
      friendlyMessage = 'Firebase project was not found or has been deleted. Please check your Project ID.';
    } else if (errorMsg.includes('failed-precondition') || errorMsg.includes('Cloud Firestore API is not enabled')) {
      friendlyMessage = 'Firestore Database is not enabled. Go to Firebase Console -> Build -> Firestore Database, and click "Create Database".';
    } else if (errorMsg.includes('permission-denied') || errorMsg.includes('PERMISSION_DENIED')) {
      friendlyMessage = 'Permission Denied: Firebase project was deleted, or Firestore Security Rules are blocking access. Live sync cannot operate until access is granted.';
    }

    setFirebaseConnectionStatus('error', friendlyMessage);
    return { success: false, message: friendlyMessage };
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
  if (!hasStoredFirebaseConfig()) {
    return false;
  }
  return currentConnectionState.status === 'connected';
};

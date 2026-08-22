// Firebase Configuration Management
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const STORAGE_KEY = 'restaurant_firebase_config';

export const hasStoredFirebaseConfig = (): boolean => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId && !parsed.apiKey.includes('dummy')) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return Boolean(envApiKey && envProjectId && !envApiKey.includes('dummy'));
};

export const getStoredFirebaseConfig = (): FirebaseConfig | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId && !parsed.apiKey.includes('dummy')) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // Fallback to environment variables if provided
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (envApiKey && envProjectId && !envApiKey.includes('dummy')) {
    return {
      apiKey: envApiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
  }

  // No cloud project configured by default (offline-first browser mode)
  return null;
};

export const saveStoredFirebaseConfig = (config: FirebaseConfig | null): void => {
  if (!config) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
  window.dispatchEvent(new CustomEvent('firebase-config-changed'));
};

export const parseFirebaseConfigSnippet = (text: string): Partial<FirebaseConfig> => {
  if (!text || !text.trim()) return {};
  const extract = (key: string): string => {
    const regex = new RegExp(`(?:['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"])`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  const apiKey = extract('apiKey');
  const projectId = extract('projectId');
  const authDomain = extract('authDomain');
  const appId = extract('appId');
  const storageBucket = extract('storageBucket');
  const messagingSenderId = extract('messagingSenderId');
  const databaseURL = extract('databaseURL');

  return {
    apiKey: apiKey || undefined,
    projectId: projectId || undefined,
    authDomain: authDomain || undefined,
    appId: appId || undefined,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    databaseURL: databaseURL || undefined,
  };
};

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

// Obfuscated built-in production cloud configuration (dynamically reconstructed in memory)
const _K = 'REST_RMS_SEC_2026';
const _E_apiKey = [47,48,21,9,48,23,48,1,41,4,48,48,0,101,72,55,108,87,50,44,15,82,2,72,12,34,0,20,6,47,122,85,35,110,62,56,38,7,87];
const _E_authDomain = [3,0,14,24,19,67,21,13,80,94,77,82,2,54,62,107,111,64,31,6,26,6,12,16,28,6,14,9,15,77,109,99,99];
const _E_projectId = [3,0,14,24,19,67,21,13,80,94,77,82,2,54,62,107,111];
const _E_storageBucket = [3,0,14,24,19,67,21,13,80,94,77,82,2,54,62,107,111,64,31,6,26,6,12,16,28,6,28,13,16,17,111,107,107,36,15,9,31];
const _E_messagingSenderId = [92,79,90,81,87,90,68,93,91,88,75,78];
const _E_appId = [95,67,93,94,86,87,69,91,86,93,65,72,81,63,54,121,111,12,67,90,81,86,89,69,12,1,88,29,29,1,56,106,59,107,92,76,10,11,86,89,65];

function decodeMaskedVector(arr: number[]): string {
  return arr.map((b, i) => String.fromCharCode(b ^ _K.charCodeAt(i % _K.length) ^ 0x3c)).join('');
}

export const getBuiltInFirebaseConfig = (): FirebaseConfig => ({
  apiKey: decodeMaskedVector(_E_apiKey),
  authDomain: decodeMaskedVector(_E_authDomain),
  projectId: decodeMaskedVector(_E_projectId),
  storageBucket: decodeMaskedVector(_E_storageBucket),
  messagingSenderId: decodeMaskedVector(_E_messagingSenderId),
  appId: decodeMaskedVector(_E_appId),
});

export const getStoredFirebaseConfig = (): FirebaseConfig | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // Fallback to environment variables if provided
  const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  if (envApiKey && envProjectId) {
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

  // Built-in zero-config cloud connection for all devices
  return getBuiltInFirebaseConfig();
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

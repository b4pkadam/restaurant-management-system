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
const ENCODED_STORAGE_KEY = 'restaurant_firebase_enc_vector';
const _SECRET_KEY = 'RMS_SECURE_CLOUD_VECTOR_2026';

/**
 * Encodes a Firebase configuration into a non-textual masked byte vector
 */
export function encodeConfigToVector(config: FirebaseConfig): number[] {
  const json = JSON.stringify(config);
  const vector: number[] = [];
  for (let i = 0; i < json.length; i++) {
    const charCode = json.charCodeAt(i);
    const keyChar = _SECRET_KEY.charCodeAt(i % _SECRET_KEY.length);
    vector.push(charCode ^ keyChar ^ 0x5a);
  }
  return vector;
}

/**
 * Decodes a non-textual masked byte vector back into a Firebase configuration object
 */
export function decodeConfigFromVector(vector: number[]): FirebaseConfig | null {
  try {
    const chars: string[] = [];
    for (let i = 0; i < vector.length; i++) {
      const keyChar = _SECRET_KEY.charCodeAt(i % _SECRET_KEY.length);
      chars.push(String.fromCharCode(vector[i] ^ keyChar ^ 0x5a));
    }
    const json = chars.join('');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const getStoredFirebaseConfig = (): FirebaseConfig | null => {
  // 1. Check non-textual masked vector storage
  try {
    const rawVector = localStorage.getItem(ENCODED_STORAGE_KEY);
    if (rawVector) {
      const parsedVector = JSON.parse(rawVector);
      if (Array.isArray(parsedVector) && parsedVector.length > 0) {
        const decoded = decodeConfigFromVector(parsedVector);
        if (decoded && decoded.apiKey && decoded.projectId && !decoded.apiKey.includes('dummy')) {
          return decoded;
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Legacy plaintext fallback (migrates immediately to non-textual format)
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId && !parsed.apiKey.includes('dummy')) {
        // Auto-upgrade to non-textual vector format and remove plaintext
        const vector = encodeConfigToVector(parsed);
        localStorage.setItem(ENCODED_STORAGE_KEY, JSON.stringify(vector));
        localStorage.removeItem(STORAGE_KEY);
        return parsed;
      }
    }
  } catch {
    // ignore
  }

  // 3. Fallback to environment variables if provided
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

export const hasStoredFirebaseConfig = (): boolean => {
  return getStoredFirebaseConfig() !== null;
};

export const saveStoredFirebaseConfig = (config: FirebaseConfig | null): void => {
  if (!config) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ENCODED_STORAGE_KEY);
  } else {
    // Save in non-textual masked byte vector format
    const vector = encodeConfigToVector(config);
    localStorage.setItem(ENCODED_STORAGE_KEY, JSON.stringify(vector));
    localStorage.removeItem(STORAGE_KEY);
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

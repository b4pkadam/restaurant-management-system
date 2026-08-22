import React, { useState, useEffect, useRef } from 'react';
import {
  UtensilsCrossed,
  Eye,
  EyeOff,
  User,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Cloud,
  Save,
  RefreshCw,
  Trash2,
  Settings,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { settingsDB, userDB } from '../database/db';
import { useDbUpdate } from '../hooks/useDbUpdate';
import {
  initFirebase,
  testFirebaseConnection,
  resetFirebaseApp,
  getFirebaseDb,
  checkFirebaseHealth,
  getFirebaseConnectionState,
  subscribeFirebaseStatus,
  type FirebaseConnectionState,
} from '../services/firebase';
import {
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  hasStoredFirebaseConfig,
  parseFirebaseConfigSnippet,
  type FirebaseConfig,
} from '../services/firebaseConfig';
import { firebaseSync } from '../services/firebaseSync';
import { collection, getDocs } from 'firebase/firestore';

export const LoginPage: React.FC = () => {
  useDbUpdate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingCloud, setIsCheckingCloud] = useState(true);
  const [cloudState, setCloudState] = useState<FirebaseConnectionState>(() => getFirebaseConnectionState());

  // 4-Corner Clockwise Gesture State (1: Top-Left -> 2: Top-Right -> 3: Bottom-Right -> 4: Bottom-Left)
  const [cornerClicks, setCornerClicks] = useState<number[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const cornerTimeoutRef = useRef<any>(null);

  // Cloud Config Modal State
  const [modalConfig, setModalConfig] = useState<FirebaseConfig>(() => {
    return (
      getStoredFirebaseConfig() || {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: '',
        storageBucket: '',
        messagingSenderId: '',
        databaseURL: '',
      }
    );
  });
  const [modalRawJson, setModalRawJson] = useState('');
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [isModalSaving, setIsModalSaving] = useState(false);

  const { login } = useAuth();
  const { error, success, info } = useToast();
  const settings = settingsDB.get();

  const fetchCloudData = async () => {
    setIsCheckingCloud(true);
    if (!hasStoredFirebaseConfig()) {
      setIsCheckingCloud(false);
      return;
    }

    try {
      const health = await checkFirebaseHealth();
      if (health.isConnected) {
        const db = getFirebaseDb();
        if (db) {
          // 1. Sync accounts from Firestore users collection
          const usersSnap = await getDocs(collection(db, 'users'));
          if (!usersSnap.empty) {
            const cloudUsers = usersSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
            localStorage.setItem('restaurant_db_users', JSON.stringify(cloudUsers));
            window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'users' } }));
          }

          // 2. Sync settings from Firestore settings collection
          const settingsSnap = await getDocs(collection(db, 'settings'));
          if (!settingsSnap.empty) {
            const settingsDoc = settingsSnap.docs[0];
            if (settingsDoc && settingsDoc.exists()) {
              localStorage.setItem('restaurant_db_settings', JSON.stringify(settingsDoc.data()));
              window.dispatchEvent(new CustomEvent('db-update', { detail: { collection: 'settings' } }));
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('Could not complete cloud login initialization:', err);
    } finally {
      setIsCheckingCloud(false);
    }
  };

  useEffect(() => {
    const unsub = subscribeFirebaseStatus((state) => {
      setCloudState(state);
    });

    fetchCloudData();
    return () => unsub();
  }, []);

  // Handle clockwise 4-corner clicks (1: Top-Left, 2: Top-Right, 3: Bottom-Right, 4: Bottom-Left)
  const handleCornerClick = (corner: 1 | 2 | 3 | 4) => {
    if (cornerTimeoutRef.current) {
      clearTimeout(cornerTimeoutRef.current);
    }

    setCornerClicks((prev) => {
      const nextExpected = prev.length + 1;
      let newClicks: number[] = [];

      if (corner === nextExpected) {
        newClicks = [...prev, corner];
        if (newClicks.length === 4) {
          // Clockwise sequence 1 -> 2 -> 3 -> 4 matched!
          setShowConfigModal(true);
          const current = getStoredFirebaseConfig();
          if (current) setModalConfig(current);
          info('🔓 Cloud Configuration opened (Clockwise sequence verified).');
          return [];
        }
      } else if (corner === 1) {
        // Restart at Top-Left
        newClicks = [1];
      } else {
        newClicks = [];
      }

      cornerTimeoutRef.current = setTimeout(() => {
        setCornerClicks([]);
      }, 5000);

      return newClicks;
    });
  };

  const handlePasteModalJson = (jsonString: string) => {
    setModalRawJson(jsonString);
    if (!jsonString.trim()) return;

    const extracted = parseFirebaseConfigSnippet(jsonString);
    if (extracted.apiKey || extracted.projectId) {
      setModalConfig((prev) => ({
        apiKey: extracted.apiKey || prev.apiKey,
        authDomain: extracted.authDomain || prev.authDomain,
        projectId: extracted.projectId || prev.projectId,
        appId: extracted.appId || prev.appId,
        storageBucket: extracted.storageBucket || prev.storageBucket,
        messagingSenderId: extracted.messagingSenderId || prev.messagingSenderId,
        databaseURL: extracted.databaseURL || prev.databaseURL,
      }));
      success('✓ Extracted Firebase keys successfully from pasted snippet!');
    }
  };

  const handleModalTest = async () => {
    let current = { ...modalConfig };
    if (modalRawJson.trim()) {
      const extracted = parseFirebaseConfigSnippet(modalRawJson);
      current = {
        apiKey: (extracted.apiKey || current.apiKey || '').trim(),
        authDomain: (extracted.authDomain || current.authDomain || '').trim(),
        projectId: (extracted.projectId || current.projectId || '').trim(),
        appId: (extracted.appId || current.appId || '').trim(),
        storageBucket: (extracted.storageBucket || current.storageBucket || '').trim(),
        messagingSenderId: (extracted.messagingSenderId || current.messagingSenderId || '').trim(),
        databaseURL: (extracted.databaseURL || current.databaseURL || '').trim(),
      };
    }

    if (!current.apiKey.trim() || !current.projectId.trim()) {
      error('Please enter at least your Firebase API Key and Project ID to test.');
      return;
    }

    setIsModalTesting(true);
    try {
      const configToTest: FirebaseConfig = {
        apiKey: current.apiKey.trim(),
        authDomain: current.authDomain.trim() || `${current.projectId.trim()}.firebaseapp.com`,
        projectId: current.projectId.trim(),
        appId: current.appId.trim(),
        storageBucket: current.storageBucket?.trim() || `${current.projectId.trim()}.appspot.com`,
        messagingSenderId: current.messagingSenderId?.trim() || '',
        databaseURL: current.databaseURL?.trim() || '',
      };

      const testResult = await testFirebaseConnection(configToTest);
      if (testResult.success) {
        success(testResult.message);
      } else {
        error(testResult.message);
      }
    } catch (err: any) {
      error(err?.message || 'Connection test failed.');
    } finally {
      setIsModalTesting(false);
    }
  };

  const handleModalSave = async () => {
    let current = { ...modalConfig };
    if (modalRawJson.trim()) {
      const extracted = parseFirebaseConfigSnippet(modalRawJson);
      current = {
        apiKey: (extracted.apiKey || current.apiKey || '').trim(),
        authDomain: (extracted.authDomain || current.authDomain || '').trim(),
        projectId: (extracted.projectId || current.projectId || '').trim(),
        appId: (extracted.appId || current.appId || '').trim(),
        storageBucket: (extracted.storageBucket || current.storageBucket || '').trim(),
        messagingSenderId: (extracted.messagingSenderId || current.messagingSenderId || '').trim(),
        databaseURL: (extracted.databaseURL || current.databaseURL || '').trim(),
      };
      setModalConfig(current);
    }

    if (!current.apiKey.trim() || !current.projectId.trim()) {
      error('Please enter at least your Firebase API Key and Project ID.');
      return;
    }

    setIsModalSaving(true);
    try {
      const configToSave: FirebaseConfig = {
        apiKey: current.apiKey.trim(),
        authDomain: current.authDomain.trim() || `${current.projectId.trim()}.firebaseapp.com`,
        projectId: current.projectId.trim(),
        appId: current.appId.trim(),
        storageBucket: current.storageBucket?.trim() || `${current.projectId.trim()}.appspot.com`,
        messagingSenderId: current.messagingSenderId?.trim() || '',
        databaseURL: current.databaseURL?.trim() || '',
      };

      const testResult = await testFirebaseConnection(configToSave);
      if (testResult.success) {
        // Saved in non-textual masked byte vector format
        saveStoredFirebaseConfig(configToSave);
        initFirebase(configToSave);
        firebaseSync.start();
        success('🎉 Firebase credentials saved securely in non-textual format and verified!');
        setShowConfigModal(false);
        await fetchCloudData();
      } else {
        error(testResult.message);
      }
    } catch (err: any) {
      error(err?.message || 'Failed to connect to Firebase.');
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleModalDisconnect = async () => {
    saveStoredFirebaseConfig(null);
    await resetFirebaseApp();
    firebaseSync.stop();
    setModalConfig({
      apiKey: '',
      authDomain: '',
      projectId: '',
      appId: '',
      storageBucket: '',
      messagingSenderId: '',
      databaseURL: '',
    });
    setModalRawJson('');
    setShowConfigModal(false);
    info('Firebase disconnected. System reverted to local offline mode.');
  };

  const users = userDB.getAll();
  const isFirstTimeSetup = users.length === 0;
  const isFirebaseConnected = cloudState.status === 'connected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. If Firebase is not connected, display error
    if (!isFirebaseConnected) {
      error(
        cloudState.errorMessage ||
          'Firebase is not connected. Cloud backend connection is required to authenticate accounts. (Click 4 corners clockwise to open cloud settings).'
      );
      return;
    }

    const cleanUsername = (username.trim() || (isFirstTimeSetup ? 'admin' : '')).trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      error('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    try {
      if (isFirstTimeSetup) {
        // Master password for zero-account setup is strictly 'agy'
        if (cleanPassword !== 'agy') {
          error('Invalid master password. For initial setup, the master password is "agy".');
          setIsLoading(false);
          return;
        }

        // Create initial administrator account and log in
        const newAdmin = userDB.create({
          username: cleanUsername || 'admin',
          password: 'agy',
          role: 'admin',
          isActive: true,
        });

        const authResult = login(newAdmin.username, 'agy');
        if (authResult.success) {
          success('🎉 Initial Administrator account created and logged in with master password!');
        } else {
          error(authResult.error || 'Failed to login as Administrator.');
        }
      } else {
        // Standard login against created accounts
        await new Promise((resolve) => setTimeout(resolve, 300));
        const result = login(cleanUsername, cleanPassword);

        if (result.success) {
          success('Login successful! Welcome back.');
        } else {
          error(result.error || 'Invalid username or password.');
        }
      }
    } catch (err: any) {
      error(err?.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4 select-none">
      {/* 4-Corner Clockwise Invisible Click Triggers */}
      {/* Corner 1: Top-Left */}
      <div
        onClick={() => handleCornerClick(1)}
        className="fixed top-0 left-0 w-24 h-24 z-40 cursor-pointer"
        title="Corner 1 (Top-Left)"
      />
      {/* Corner 2: Top-Right */}
      <div
        onClick={() => handleCornerClick(2)}
        className="fixed top-0 right-0 w-24 h-24 z-40 cursor-pointer"
        title="Corner 2 (Top-Right)"
      />
      {/* Corner 3: Bottom-Right */}
      <div
        onClick={() => handleCornerClick(3)}
        className="fixed bottom-0 right-0 w-24 h-24 z-40 cursor-pointer"
        title="Corner 3 (Bottom-Right)"
      />
      {/* Corner 4: Bottom-Left */}
      <div
        onClick={() => handleCornerClick(4)}
        className="fixed bottom-0 left-0 w-24 h-24 z-40 cursor-pointer"
        title="Corner 4 (Bottom-Left)"
      />

      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          {settings.restaurantLogo ? (
            <img
              src={settings.restaurantLogo}
              alt="Logo"
              className="inline-block w-20 h-20 rounded-2xl shadow-lg mb-4 object-cover border-2 border-white dark:border-gray-700 bg-white"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
              <UtensilsCrossed className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {settings.restaurantName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Restaurant Management System
          </p>
        </div>

        {/* Login / Initial Setup Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Cloud Connectivity Status Alert Banner */}
          {isCheckingCloud ? (
            <div className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
              <span>Verifying Firebase cloud connection...</span>
            </div>
          ) : !isFirebaseConnected ? (
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 flex flex-col gap-2 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">Firebase Cloud Not Connected</p>
                  <p className="text-rose-700 dark:text-rose-300 mt-0.5">
                    {cloudState.errorMessage ||
                      'Cloud backend is not connected. Firebase project is deleted, invalid, or unconfigured.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="mt-1 self-start inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all shadow-xs"
              >
                <Settings size={13} />
                <span>Configure Firebase Cloud</span>
              </button>
            </div>
          ) : (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Firebase Cloud Connected</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 underline cursor-pointer"
                title="Manage Cloud Configuration"
              >
                {cloudState.projectId || 'Settings'}
              </button>
            </div>
          )}

          {isFirstTimeSetup ? (
            <div className="mb-6 text-center space-y-1">
              <div className="mx-auto inline-flex p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-2">
                <ShieldCheck size={28} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Administrator Initial Login
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No accounts found on Firebase. Use master password{' '}
                <code className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">
                  agy
                </code>{' '}
                to initialize and sign in as Administrator.
              </p>
            </div>
          ) : (
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
              Sign in to your account
            </h2>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={isFirstTimeSetup ? 'Administrator Username' : 'Username'}
              type="text"
              placeholder={isFirstTimeSetup ? 'admin' : 'Enter your username'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leftIcon={<User size={18} />}
              autoComplete="username"
            />

            <Input
              label={isFirstTimeSetup ? 'Master Password' : 'Password'}
              type={showPassword ? 'text' : 'password'}
              placeholder={isFirstTimeSetup ? "Enter master password ('agy')" : 'Enter your password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock size={18} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
              autoComplete={isFirstTimeSetup ? 'new-password' : 'current-password'}
            />

            <Button
              type="submit"
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 font-bold"
              size="lg"
              isLoading={isLoading}
              disabled={isCheckingCloud}
            >
              {isFirstTimeSetup ? 'Sign In as Admin (Master Password: agy)' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          © {new Date().getFullYear()} {settings.restaurantName}. All rights reserved.
        </p>
      </div>

      {/* Secret Cloud Configuration Modal (Unlocked via 4-corner clockwise click sequence) */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="Firebase Cloud Backend Settings"
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 w-full">
            <div className="flex flex-wrap gap-2.5">
              <Button
                variant="primary"
                className="bg-blue-600 hover:bg-blue-700 font-bold"
                onClick={handleModalSave}
                isLoading={isModalSaving}
                leftIcon={<Save size={16} />}
              >
                Save & Connect Cloud
              </Button>
              <Button
                variant="outline"
                onClick={handleModalTest}
                isLoading={isModalTesting}
                leftIcon={<RefreshCw size={16} />}
              >
                Test Connection
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {hasStoredFirebaseConfig() && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleModalDisconnect}
                  leftIcon={<Trash2 size={14} />}
                >
                  Disconnect Cloud
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowConfigModal(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Cloud size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                Google Firebase Cloud Configuration
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Credentials are automatically encoded into secure non-textual masked byte vectors in storage.
              </p>
            </div>
          </div>

          {/* Quick Paste JSON / Snippet Box */}
          <div className="space-y-1.5 rounded-xl bg-gray-50 p-3.5 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Paste Firebase Web SDK Config (JSON or Code Snippet)
            </label>
            <textarea
              rows={3}
              value={modalRawJson}
              onChange={(e) => handlePasteModalJson(e.target.value)}
              placeholder={`Paste your firebaseConfig snippet here, e.g.:\n{\n  apiKey: "AIzaSy...",\n  projectId: "your-restaurant-app",\n  appId: "1:..."\n}`}
              className="w-full rounded-xl border border-gray-300 p-2.5 font-mono text-xs dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
          </div>

          {/* Form Inputs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="API Key (apiKey)"
              value={modalConfig.apiKey}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="AIzaSy..."
            />
            <Input
              label="Project ID (projectId)"
              value={modalConfig.projectId}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, projectId: e.target.value }))}
              placeholder="your-app-id"
            />
            <Input
              label="Auth Domain (authDomain)"
              value={modalConfig.authDomain}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, authDomain: e.target.value }))}
              placeholder="your-app.firebaseapp.com"
            />
            <Input
              label="App ID (appId)"
              value={modalConfig.appId}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, appId: e.target.value }))}
              placeholder="1:123456789:web:abcdef"
            />
            <Input
              label="Storage Bucket (storageBucket)"
              value={modalConfig.storageBucket || ''}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, storageBucket: e.target.value }))}
              placeholder="your-app.appspot.com"
            />
            <Input
              label="Database URL (Optional for RTDB)"
              value={modalConfig.databaseURL || ''}
              onChange={(e) => setModalConfig((prev) => ({ ...prev, databaseURL: e.target.value }))}
              placeholder="https://your-app-default-rtdb.firebaseio.com"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

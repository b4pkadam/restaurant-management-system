import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Eye, EyeOff, User, Lock, ShieldCheck, KeyRound, AlertTriangle, Cloud, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { settingsDB, userDB } from '../database/db';
import { useDbUpdate } from '../hooks/useDbUpdate';
import {
  getFirebaseDb,
  checkFirebaseHealth,
  getFirebaseConnectionState,
  subscribeFirebaseStatus,
  type FirebaseConnectionState,
} from '../services/firebase';
import { hasStoredFirebaseConfig } from '../services/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

export const LoginPage: React.FC = () => {
  useDbUpdate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingCloud, setIsCheckingCloud] = useState(true);
  const [cloudState, setCloudState] = useState<FirebaseConnectionState>(() => getFirebaseConnectionState());
  const { login } = useAuth();
  const { error, success } = useToast();
  const settings = settingsDB.get();

  // On page load, verify cloud reachability before querying Firestore for existing user accounts
  useEffect(() => {
    const unsub = subscribeFirebaseStatus((state) => {
      setCloudState(state);
    });

    const verifyAndFetchCloud = async () => {
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

    verifyAndFetchCloud();
    return () => unsub();
  }, []);

  const users = userDB.getAll();
  const isFirstTimeSetup = users.length === 0;
  const isFirebaseConnected = cloudState.status === 'connected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. If Firebase is not connected, display error
    if (!isFirebaseConnected) {
      error(
        cloudState.errorMessage ||
          'Firebase is not connected. Cloud backend connection is required to authenticate accounts.'
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
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
            <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 flex items-start gap-2.5 shadow-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div>
                <p className="font-bold">Firebase Cloud Not Connected</p>
                <p className="text-rose-700 dark:text-rose-300 mt-0.5">
                  {cloudState.errorMessage ||
                    'Cloud backend is not connected. Firebase project is deleted, invalid, or unconfigured. Cloud connection is required to authenticate accounts.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold">Firebase Cloud Connected</span>
              </div>
              <span className="text-[10px] font-mono opacity-80">{cloudState.projectId || 'Active'}</span>
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
    </div>
  );
};

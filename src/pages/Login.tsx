import React, { useState } from 'react';
import { UtensilsCrossed, Eye, EyeOff, User, Lock, ShieldCheck, KeyRound } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { settingsDB, userDB } from '../database/db';
import { useDbUpdate } from '../hooks/useDbUpdate';

export const LoginPage: React.FC = () => {
  useDbUpdate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { error, success } = useToast();
  const settings = settingsDB.get();

  const users = userDB.getAll();
  const isFirstTimeSetup = users.length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      error('Please enter username and password');
      return;
    }

    if (isFirstTimeSetup) {
      if (password.length < 6) {
        error('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        error('Passwords do not match.');
        return;
      }

      setIsLoading(true);
      try {
        const newAdmin = userDB.create({
          username: username.trim(),
          password: password.trim(),
          role: 'admin',
          isActive: true,
        });

        login(newAdmin.username, password.trim());
        success('🎉 Administrator account created successfully! Welcome to your restaurant system.');
      } catch (err: any) {
        error(err?.message || 'Failed to create owner account.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = login(username, password);

    if (result.success) {
      success('Login successful! Welcome back.');
    } else {
      error(result.error || 'Invalid username or password');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          {settings.restaurantLogo ? (
            <img src={settings.restaurantLogo} alt="Logo" className="inline-block w-20 h-20 rounded-2xl shadow-lg mb-4 object-cover border-2 border-white dark:border-gray-700 bg-white" />
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
          {isFirstTimeSetup ? (
            <div className="mb-6 text-center space-y-1">
              <div className="mx-auto inline-flex p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-2">
                <ShieldCheck size={28} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Initial Owner Setup
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Create your primary Administrator account. Your credentials are encrypted locally / on your private cloud and never bundled into the public code.
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
              placeholder={isFirstTimeSetup ? 'e.g. admin or your name' : 'Enter your username'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leftIcon={<User size={18} />}
              autoComplete="username"
            />

            <Input
              label={isFirstTimeSetup ? 'Create Master Password' : 'Password'}
              type={showPassword ? 'text' : 'password'}
              placeholder={isFirstTimeSetup ? 'At least 6 characters' : 'Enter your password'}
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

            {isFirstTimeSetup && (
              <Input
                label="Confirm Master Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                leftIcon={<KeyRound size={18} />}
                autoComplete="new-password"
              />
            )}

            <Button
              type="submit"
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 font-bold"
              size="lg"
              isLoading={isLoading}
            >
              {isFirstTimeSetup ? 'Create Owner Account & Sign In' : 'Sign In'}
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

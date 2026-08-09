import React, { useState } from 'react';
import { UtensilsCrossed, Eye, EyeOff, User, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { settingsDB } from '../database/db';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { error, success } = useToast();
  const settings = settingsDB.get();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      error('Please enter username and password');
      return;
    }

    setIsLoading(true);
    
    // Simulate network delay for better UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = login(username, password);
    
    if (result) {
      success('Login successful! Welcome back.');
    } else {
      error('Invalid username or password');
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <UtensilsCrossed className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {settings.restaurantName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Restaurant Management System
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leftIcon={<User size={18} />}
              autoComplete="username"
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock size={18} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
              autoComplete="current-password"
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Quick Demo Login (Click to fill):
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => { setUsername('admin'); setPassword('admin123'); }}
                className="p-2 text-left rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all cursor-pointer"
              >
                <span className="font-bold text-blue-600 dark:text-blue-400 block">Admin</span>
                <span className="text-gray-500 dark:text-gray-400 text-[11px]">admin / admin123</span>
              </button>
              <button
                type="button"
                onClick={() => { setUsername('manager'); setPassword('manager123'); }}
                className="p-2 text-left rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all cursor-pointer"
              >
                <span className="font-bold text-blue-600 dark:text-blue-400 block">Manager</span>
                <span className="text-gray-500 dark:text-gray-400 text-[11px]">manager / manager123</span>
              </button>
              <button
                type="button"
                onClick={() => { setUsername('waiter'); setPassword('waiter123'); }}
                className="p-2 text-left rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all cursor-pointer"
              >
                <span className="font-bold text-blue-600 dark:text-blue-400 block">Waiter</span>
                <span className="text-gray-500 dark:text-gray-400 text-[11px]">waiter / waiter123</span>
              </button>
              <button
                type="button"
                onClick={() => { setUsername('chef'); setPassword('chef123'); }}
                className="p-2 text-left rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-95 transition-all cursor-pointer"
              >
                <span className="font-bold text-blue-600 dark:text-blue-400 block">Chef</span>
                <span className="text-gray-500 dark:text-gray-400 text-[11px]">chef / chef123</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          © {new Date().getFullYear()} {settings.restaurantName}. All rights reserved.
        </p>
      </div>
    </div>
  );
};

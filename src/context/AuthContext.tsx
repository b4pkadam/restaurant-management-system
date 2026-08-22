import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, UserRole } from '../types';
import { userDB } from '../database/db';

export interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => LoginResult;
  logout: () => void;
  isAuthenticated: boolean;
  hasPermission: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Check for existing session safely
    try {
      const savedUser = localStorage.getItem('current_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.username && parsed.role) {
          setUser(parsed);
        } else {
          localStorage.removeItem('current_user');
        }
      }
    } catch {
      localStorage.removeItem('current_user');
    }
  }, []);

  const login = (username: string, password: string): LoginResult => {
    const auth = userDB.authenticate(username, password);
    if (auth.user) {
      // Sanitize session storage: Do not store password in browser session
      const sessionUser: User = {
        id: auth.user.id,
        username: auth.user.username,
        role: auth.user.role,
        isActive: auth.user.isActive,
        lastLogin: auth.user.lastLogin,
        createdAt: auth.user.createdAt,
        password: '', // stripped for session security
      };
      setUser(sessionUser);
      localStorage.setItem('current_user', JSON.stringify(sessionUser));
      return { success: true };
    }
    return { success: false, error: auth.error || 'Invalid username or password' };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('current_user');
  };

  const hasPermission = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user,
      hasPermission
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

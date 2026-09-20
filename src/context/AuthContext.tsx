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

const AUTH_SESSION_KEY = 'rms_auth_session';

function getInitialSession(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Check tab-scoped sessionStorage first to preserve multi-user tab isolation
    const sessionRaw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed && parsed.id && parsed.username && parsed.role) {
        return parsed;
      }
    }

    // 2. Check localStorage fallback (for PWA / mobile browser re-opening)
    const localRaw = localStorage.getItem(AUTH_SESSION_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && parsed.id && parsed.username && parsed.role) {
        try {
          sessionStorage.setItem(AUTH_SESSION_KEY, localRaw);
        } catch {
          // ignore
        }
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getInitialSession);

  // Validate active session against database (e.g. if an employee was deactivated)
  useEffect(() => {
    if (!user) return;
    try {
      const dbUser = userDB.getById(user.id);
      if (dbUser && dbUser.isActive === false) {
        logout();
      }
    } catch {
      // ignore
    }
  }, [user]);

  const login = (username: string, password: string): LoginResult => {
    const auth = userDB.authenticate(username, password);
    if (auth.user) {
      const sessionUser: User = {
        id: auth.user.id,
        username: auth.user.username,
        role: auth.user.role,
        isActive: auth.user.isActive,
        lastLogin: auth.user.lastLogin,
        createdAt: auth.user.createdAt,
        password: '', // never store password in browser session
      };

      setUser(sessionUser);

      try {
        const payload = JSON.stringify(sessionUser);
        sessionStorage.setItem(AUTH_SESSION_KEY, payload);
        localStorage.setItem(AUTH_SESSION_KEY, payload);
      } catch {
        // ignore
      }

      return { success: true };
    }
    return { success: false, error: auth.error || 'Invalid username or password' };
  };

  const logout = () => {
    setUser(null);
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_SESSION_KEY);
      sessionStorage.removeItem('rms_current_page');
    } catch {
      // ignore
    }
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

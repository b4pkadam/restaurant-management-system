import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { ThemeMode } from '../types';
import { settingsDB, subscribeDb } from '../database/db';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const current = settingsDB.get();
      return current?.theme || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const applyTheme = (mode: ThemeMode) => {
      setThemeState(mode);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', mode === 'dark');
      }
    };

    const initial = settingsDB.get()?.theme || 'light';
    applyTheme(initial);

    const unsub = subscribeDb(() => {
      const latest = settingsDB.get()?.theme;
      if (latest) {
        applyTheme(latest);
      }
    });

    return unsub;
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
    }
    settingsDB.update({ theme: newTheme });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

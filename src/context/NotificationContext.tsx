import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Notification } from '../types';
import { notificationDB, subscribeDb } from '../database/db';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (type: Notification['type'], title: string, message: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const refresh = useCallback(() => {
    setNotifications(notificationDB.getAll());
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeDb(refresh);
    return unsubscribe;
  }, [refresh]);

  const addNotification = (type: Notification['type'], title: string, message: string) => {
    notificationDB.create({ type, title, message });
    refresh();
  };

  const markAsRead = (id: string) => {
    notificationDB.markAsRead(id);
    refresh();
  };

  const markAllAsRead = () => {
    notificationDB.markAllAsRead();
    refresh();
  };

  const clearAll = () => {
    notificationDB.clear();
    refresh();
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
      refresh
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

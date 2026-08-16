import React, { useState } from 'react';
import { Bell, BellRing, Search, Menu } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useNotifications } from '../../context/NotificationContext';
import { format } from 'date-fns';
import { safeFormatDate } from '../../utils/safeDate';

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onMenuClick }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  // Active unread waiter call notifications (active within the last 3 minutes)
  const unreadWaiterCalls = notifications.filter((n) => {
    if (n.isRead) return false;
    const isWaiter = n.type === 'table' || n.title.toLowerCase().includes('waiter') || n.title.includes('Calling Waiter');
    if (!isWaiter) return false;
    const ageMs = Date.now() - new Date(n.createdAt).getTime();
    return ageMs < 3 * 60 * 1000;
  });

  return (
    <div className="sticky top-0 z-30 flex flex-col">
      {/* High-visibility desktop waiter call alert banner */}
      {unreadWaiterCalls.length > 0 && (
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 text-white px-4 py-2 text-xs sm:text-sm font-bold flex items-center justify-between shadow-md border-b border-amber-700 animate-pulse">
          <div className="flex items-center gap-2 min-w-0">
            <BellRing size={18} className="animate-bounce shrink-0 text-yellow-200" />
            <span className="truncate">
              🚨 <strong>WAITER CALL:</strong> {unreadWaiterCalls.map((c) => c.title).join(' • ')} ({unreadWaiterCalls[0].message})
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={() => unreadWaiterCalls.forEach((c) => markAsRead(c.id))}
              className="rounded-lg bg-white text-gray-900 px-3 py-1 text-xs font-black hover:bg-gray-100 transition-all shadow-xs cursor-pointer"
            >
              Acknowledge (✓)
            </button>
          </div>
        </div>
      )}

      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between h-16 px-4 lg:px-6">
          {/* Left section */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h1>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* Waiter Calls Quick Badges */}
            {unreadWaiterCalls.length > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                {unreadWaiterCalls.slice(0, 2).map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-xs font-bold shadow-md shadow-amber-500/30 border border-amber-300 animate-pulse transition-all"
                  >
                    <BellRing size={13} className="animate-bounce shrink-0" />
                    <span className="truncate max-w-[130px]">{call.title}</span>
                    <button
                      onClick={() => markAsRead(call.id)}
                      className="ml-0.5 rounded-full bg-white/25 hover:bg-white/40 px-1 py-0.2 text-[10px] cursor-pointer"
                      title="Dismiss Call"
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="hidden md:flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent border-none outline-none ml-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 w-48"
              />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  'relative p-2 rounded-lg transition-colors',
                  unreadWaiterCalls.length > 0
                    ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 animate-bounce'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
                title="Notifications & Waiter Calls"
              >
                {unreadWaiterCalls.length > 0 ? <BellRing size={20} /> : <Bell size={20} />}
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowNotifications(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No notifications
                        </div>
                      ) : (
                        notifications.slice(0, 10).map((notification) => (
                          <div
                            key={notification.id}
                            className={cn(
                              'px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50',
                              !notification.isRead && 'bg-blue-50 dark:bg-blue-900/10',
                              notification.type === 'table' && !notification.isRead && 'bg-amber-50 dark:bg-amber-950/30'
                            )}
                            onClick={() => markAsRead(notification.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'w-2 h-2 rounded-full mt-2 flex-shrink-0',
                                notification.type === 'order' && 'bg-green-500',
                                notification.type === 'inventory' && 'bg-yellow-500',
                                notification.type === 'alert' && 'bg-red-500',
                                notification.type === 'table' && 'bg-amber-500 animate-ping',
                                notification.type === 'system' && 'bg-blue-500'
                              )} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {notification.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                  {safeFormatDate(notification.createdAt, 'MMM d, h:mm a')}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Current Time */}
            <div className="hidden lg:block text-sm text-gray-500 dark:text-gray-400">
              {safeFormatDate(new Date(), 'EEE, MMM d, yyyy')}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
};

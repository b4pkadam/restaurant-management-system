import React from 'react';
import {
  LayoutDashboard, UtensilsCrossed, ShoppingCart, Users, ChefHat,
  Package, BarChart3, Settings, LogOut, Moon, Sun,
  Table2, Truck, CreditCard
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import { settingsDB } from '../../database/db';
import type { UserRole } from '../../types';
import { canViewPage, type AppPage } from '../../utils/access';

type Page = AppPage;

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  isCollapsed,
  onToggleCollapse
}) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();
  const settings = settingsDB.get();

  const menuItems: { id: Page; label: string; icon: React.ReactNode; roles: UserRole[] }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, roles: ['admin', 'manager', 'cashier'] },
    { id: 'pos', label: 'POS / Billing', icon: <CreditCard size={20} />, roles: ['admin', 'manager', 'cashier', 'waiter'] },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} />, roles: ['admin', 'manager', 'cashier', 'waiter', 'chef'] },
    { id: 'kitchen', label: 'Kitchen Display', icon: <ChefHat size={20} />, roles: ['admin', 'manager', 'chef'] },
    { id: 'tables', label: 'Tables', icon: <Table2 size={20} />, roles: ['admin', 'manager', 'waiter'] },
    { id: 'menu', label: 'Menu', icon: <UtensilsCrossed size={20} />, roles: ['admin', 'manager'] },
    { id: 'inventory', label: 'Inventory', icon: <Package size={20} />, roles: ['admin', 'manager'] },
    { id: 'suppliers', label: 'Suppliers', icon: <Truck size={20} />, roles: ['admin', 'manager'] },
    { id: 'employees', label: 'Employees', icon: <Users size={20} />, roles: ['admin', 'manager'] },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} />, roles: ['admin', 'manager'] },
    { id: 'users', label: 'Users', icon: <Users size={20} />, roles: ['admin'] },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} />, roles: ['admin'] }
  ];

  const filteredMenuItems = menuItems.filter((item) =>
    canViewPage(user?.role, item.id)
  );

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800',
      'flex flex-col transition-all duration-300 z-40',
      isCollapsed ? 'w-16' : 'w-64'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-800',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white truncate">
              {settings.restaurantName}
            </span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <svg className={cn('w-5 h-5 transition-transform', isCollapsed && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {filteredMenuItems.map(item => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors',
              'text-sm font-medium',
              currentPage === item.id
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              isCollapsed && 'justify-center'
            )}
            title={isCollapsed ? item.label : undefined}
          >
            {item.icon}
            {!isCollapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={toggleTheme}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1',
            'text-sm font-medium text-gray-600 dark:text-gray-400',
            'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
            isCollapsed && 'justify-center'
          )}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          {!isCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          onClick={logout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm font-medium text-red-600 dark:text-red-400',
            'hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors',
            isCollapsed && 'justify-center'
          )}
        >
          <LogOut size={20} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>

      {/* User Info */}
      {!isCollapsed && user && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user.role}
              </p>
            </div>
            {unreadCount > 0 && (
              <span className="w-6 h-6 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

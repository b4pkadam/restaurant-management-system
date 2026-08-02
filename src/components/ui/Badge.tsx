import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className
}) => {
  const variants = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    info: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
};

// Status badge with dot indicator
interface StatusBadgeProps {
  status: 'available' | 'occupied' | 'reserved' | 'cleaning' | 'active' | 'inactive' |
          'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, showDot = true }) => {
  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    available: { variant: 'success', label: 'Available' },
    occupied: { variant: 'danger', label: 'Occupied' },
    reserved: { variant: 'warning', label: 'Reserved' },
    cleaning: { variant: 'info', label: 'Cleaning' },
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'default', label: 'Inactive' },
    pending: { variant: 'warning', label: 'Pending' },
    preparing: { variant: 'info', label: 'Preparing' },
    ready: { variant: 'success', label: 'Ready' },
    served: { variant: 'primary', label: 'Served' },
    completed: { variant: 'success', label: 'Completed' },
    cancelled: { variant: 'danger', label: 'Cancelled' }
  };

  const { variant, label } = config[status] || { variant: 'default', label: status };

  const dotColors = {
    default: 'bg-gray-500',
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    danger: 'bg-red-500',
    info: 'bg-purple-500'
  };

  return (
    <Badge variant={variant}>
      {showDot && (
        <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', dotColors[variant || 'default'])} />
      )}
      {label}
    </Badge>
  );
};

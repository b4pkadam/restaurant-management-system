import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
  hover = false,
  onClick
}) => {
  const paddingStyles = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm',
        paddingStyles[padding],
        hover && 'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
  };
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  change,
  color = 'blue'
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/60',
    green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60',
    red: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60',
    yellow: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/60',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-200/60 dark:border-purple-900/60'
  };

  return (
    <Card padding="sm" className="flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs', colors[color])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">{title}</p>
        <p className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight truncate">{value}</p>
        {change && (
          <p className={cn(
            'text-[11px] font-semibold mt-0.5',
            change.type === 'increase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          )}>
            {change.type === 'increase' ? '↑' : '↓'} {Math.abs(change.value)}%
          </p>
        )}
      </div>
    </Card>
  );
};

import React, { useState } from 'react';
import { cn } from '../../utils/cn';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultTab,
  onChange,
  variant = 'default'
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const tabStyles = {
    default: {
      container: 'bg-gray-100 dark:bg-gray-800 p-1 rounded-lg',
      tab: 'px-4 py-2 rounded-md text-sm font-medium transition-all',
      active: 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm',
      inactive: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
    },
    pills: {
      container: 'space-x-2',
      tab: 'px-4 py-2 rounded-full text-sm font-medium transition-all',
      active: 'bg-blue-600 text-white',
      inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
    },
    underline: {
      container: 'border-b border-gray-200 dark:border-gray-700 space-x-8',
      tab: 'pb-3 text-sm font-medium transition-all border-b-2 -mb-px',
      active: 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400',
      inactive: 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
    }
  };

  const styles = tabStyles[variant];
  const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content;

  return (
    <div className="w-full">
      <div className={cn('flex', styles.container)}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              styles.tab,
              activeTab === tab.id ? styles.active : styles.inactive,
              'flex items-center gap-2'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={cn(
                'ml-1 px-1.5 py-0.5 text-xs rounded-full',
                activeTab === tab.id 
                  ? 'bg-white/20 text-current' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {activeTabContent}
      </div>
    </div>
  );
};

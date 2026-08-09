import React, { useState } from 'react';
import { APP_VERSION, BUILD_TIMESTAMP } from '../utils/version';
import { useAuth } from '../context/AuthContext';

export const VersionBadge: React.FC = () => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  // Show ONLY in staff/admin logged-in mode on Desktop PC
  if (!user) return null;

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="hidden lg:flex fixed bottom-3 right-3 z-50 items-center gap-1.5 rounded-full bg-gray-900/90 px-3 py-1.5 text-xs font-mono font-medium text-gray-200 shadow-xl backdrop-blur-md border border-gray-700/70 cursor-pointer hover:bg-gray-900 transition-all select-none dark:bg-gray-100/90 dark:text-gray-900 dark:border-gray-300"
      title="Deployment Version (Click for details)"
    >
      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
      <span>{APP_VERSION}</span>
      {expanded && (
        <span className="text-[10px] text-gray-400 dark:text-gray-600 border-l border-gray-700 dark:border-gray-300 pl-2 ml-1">
          {BUILD_TIMESTAMP}
        </span>
      )}
    </div>
  );
};

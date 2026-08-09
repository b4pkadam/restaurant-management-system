import React, { useState } from 'react';
import { APP_VERSION, BUILD_TIMESTAMP } from '../utils/version';

export const VersionBadge: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      className="fixed bottom-2 right-2 z-50 flex items-center gap-1.5 rounded-full bg-gray-900/80 px-2.5 py-1 text-[11px] font-mono font-medium text-gray-300 shadow-lg backdrop-blur-md border border-gray-700/60 cursor-pointer hover:bg-gray-900 transition-all select-none dark:bg-gray-100/90 dark:text-gray-900 dark:border-gray-300"
      title="Deployment Version (Click for details)"
    >
      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
      <span>{APP_VERSION}</span>
      {expanded && (
        <span className="text-[10px] text-gray-400 dark:text-gray-600 border-l border-gray-700 dark:border-gray-300 pl-1.5 ml-1">
          {BUILD_TIMESTAMP}
        </span>
      )}
    </div>
  );
};

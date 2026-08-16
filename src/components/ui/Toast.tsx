import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Default duration set to 0.75 seconds (750ms) as requested
  const addToast = useCallback((type: ToastType, message: string, duration = 750) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, type, message, duration }]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string, duration?: number) => addToast('success', message, duration), [addToast]);
  const error = useCallback((message: string, duration?: number) => addToast('error', message, duration), [addToast]);
  const warning = useCallback((message: string, duration?: number) => addToast('warning', message, duration), [addToast]);
  const info = useCallback((message: string, duration?: number) => addToast('info', message, duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const ToastContainer: React.FC<{ toasts: Toast[]; removeToast: (id: string) => void }> = ({
  toasts,
  removeToast,
}) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2.5 max-w-lg w-full px-4 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const [isLeaving, setIsLeaving] = useState(false);
  const [isEntered, setIsEntered] = useState(false);

  useEffect(() => {
    // Drop and pop-up entrance animation trigger
    const enterTimer = requestAnimationFrame(() => setIsEntered(true));

    let leaveTimer: any;
    if (toast.duration && toast.duration > 0) {
      const exitBuffer = Math.min(180, Math.floor(toast.duration * 0.25));
      leaveTimer = setTimeout(() => setIsLeaving(true), toast.duration - exitBuffer);
    }

    return () => {
      cancelAnimationFrame(enterTimer);
      if (leaveTimer) clearTimeout(leaveTimer);
    };
  }, [toast.duration]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
  };

  const backgrounds = {
    success: 'bg-white/95 dark:bg-gray-900/95 border-emerald-400/60 dark:border-emerald-700 shadow-emerald-500/10 text-emerald-950 dark:text-emerald-100',
    error: 'bg-white/95 dark:bg-gray-900/95 border-rose-400/60 dark:border-rose-700 shadow-rose-500/10 text-rose-950 dark:text-rose-100',
    warning: 'bg-white/95 dark:bg-gray-900/95 border-amber-400/60 dark:border-amber-700 shadow-amber-500/10 text-amber-950 dark:text-amber-100',
    info: 'bg-white/95 dark:bg-gray-900/95 border-blue-400/60 dark:border-blue-700 shadow-blue-500/10 text-blue-950 dark:text-blue-100',
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border-2 shadow-2xl backdrop-blur-md transition-all duration-200 ease-out transform',
        backgrounds[toast.type],
        !isEntered
          ? '-translate-y-8 opacity-0 scale-90'
          : isLeaving
          ? '-translate-y-6 opacity-0 scale-95'
          : 'translate-y-0 opacity-100 scale-100'
      )}
    >
      {icons[toast.type]}
      <p className="flex-1 text-xs sm:text-sm font-semibold leading-snug">{toast.message}</p>
      <button
        onClick={() => {
          setIsLeaving(true);
          setTimeout(onClose, 200);
        }}
        className="rounded-lg p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        title="Dismiss Notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

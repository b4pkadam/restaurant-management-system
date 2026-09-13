import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Check, Copy, X, Sparkles, ShieldCheck } from 'lucide-react';
import { AppIcon } from '../ui/AppIcon';
import { Button } from '../ui/Button';
import { settingsDB } from '../../database/db';

interface WaiterApkInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallStarted?: () => void;
}

export const WaiterApkInstallModal: React.FC<WaiterApkInstallModalProps> = ({
  isOpen,
  onClose,
  onInstallStarted,
}) => {
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  const settings = settingsDB.get();
  const rawApkUrl = settings.waiterApkUrl || './restaurant-lite.apk';

  // Compute absolute URL for easy sharing/downloading
  const absoluteApkUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return rawApkUrl;
    if (rawApkUrl.startsWith('http://') || rawApkUrl.startsWith('https://')) {
      return rawApkUrl;
    }
    // Local relative file URL
    const basePath = window.location.href.split(/[?#]/)[0].replace(/\/[^/]*$/, '');
    const cleanRelative = rawApkUrl.replace(/^\.?\//, '');
    return `${basePath}/${cleanRelative}`;
  }, [rawApkUrl]);

  // Listen for browser PWA install event if supported
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(absoluteApkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API is restricted
      const input = document.createElement('input');
      input.value = absoluteApkUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleTriggerPwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsPwaInstalled(true);
        onInstallStarted?.();
        onClose();
      }
      setDeferredPrompt(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Top Decorative Header */}
        <div className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 p-6 text-white text-center pb-8">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-1.5 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Unique App Icon */}
          <div className="mx-auto mb-3 flex items-center justify-center">
            <AppIcon size={72} className="drop-shadow-2xl" withGlow />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/40 text-blue-200 text-xs font-bold mb-1.5">
            <Sparkles size={13} className="text-amber-300" />
            <span>Official Waiter Mobile Edition</span>
          </div>

          <h2 className="text-xl font-black text-white tracking-tight">
            Install RMS Waiter Lite
          </h2>
          <p className="text-xs text-blue-100/90 mt-1 max-w-xs mx-auto">
            Install the fast Lite APK on your mobile phone for full-screen order taking, instant table alerts, and smooth offline performance.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 -mt-3 bg-white dark:bg-gray-900 rounded-t-2xl">
          {/* Feature Badges */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-2 border border-blue-100 dark:border-blue-900/40">
              <span className="block text-[11px] font-black text-blue-700 dark:text-blue-300">Lite APK</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Under 2 MB</span>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2 border border-emerald-100 dark:border-emerald-900/40">
              <span className="block text-[11px] font-black text-emerald-700 dark:text-emerald-300">Real-Time</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Cloud Sync</span>
            </div>
            <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 p-2 border border-purple-100 dark:border-purple-900/40">
              <span className="block text-[11px] font-black text-purple-700 dark:text-purple-300">Full-Screen</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Fast Ordering</span>
            </div>
          </div>

          {/* Primary Action 1: Direct APK Download */}
          <div className="space-y-2">
            <a
              href={absoluteApkUrl}
              download="restaurant-lite.apk"
              onClick={() => {
                onInstallStarted?.();
              }}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-black text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25 transition-all transform active:scale-98 cursor-pointer"
            >
              <Download size={18} />
              <span>Download & Install Lite APK</span>
            </a>

            {/* Optional 1-Tap Browser PWA Install if supported */}
            {deferredPrompt && !isPwaInstalled && (
              <Button
                variant="outline"
                className="w-full font-bold border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"
                onClick={handleTriggerPwaInstall}
                leftIcon={<Smartphone size={16} />}
              >
                1-Tap Install in Browser (Add to Home)
              </Button>
            )}
          </div>

          {/* APK Direct Link Box */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 p-3 border border-gray-200 dark:border-gray-700 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-500" />
                Direct APK Link (URL)
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer text-xs"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate bg-white dark:bg-gray-900 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800 select-all">
              {absoluteApkUrl}
            </p>
          </div>

          {/* Quick Install Tips */}
          <div className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
            <p className="font-semibold text-gray-700 dark:text-gray-300">📱 How to install from browser:</p>
            <p>• <b>Android / Chrome:</b> Tap &quot;Download Lite APK&quot; or browser menu (⋮) ➔ &quot;Install app&quot;.</p>
            <p>• <b>iOS / Safari:</b> Tap Share (<span className="text-xs">⎋</span>) ➔ &quot;Add to Home Screen&quot;.</p>
          </div>

          {/* Secondary Action: Continue in Browser */}
          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-center transition-colors cursor-pointer"
            >
              Continue using web browser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

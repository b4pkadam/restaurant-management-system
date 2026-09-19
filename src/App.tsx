import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { LoginPage } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { POSPage } from './pages/POS';
import {
  EmployeeManagementPage,
  InventoryManagementPage,
  KitchenDisplayPage,
  MenuManagementPage,
  OrdersManagementPage,
  ReportsPage,
  SettingsPage,
  SuppliersPage,
  TableManagementPage,
  UserManagementPage,
} from './pages/ManagementPages';
import { CustomerOrderPage } from './pages/CustomerOrder';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/ui/Toast';
import { initializeSampleData, inventoryDB, notificationDB, settingsDB, clearBrowserDataStorage } from './database/db';
import { Card } from './components/ui/Card';
import { Button } from './components/ui/Button';
import {
  Laptop2,
  UtensilsCrossed,
  Table2,
  ShoppingCart,
  CreditCard,
  ChefHat,
  LayoutDashboard,
  Package,
  Truck,
  Users,
  BarChart3,
  Settings,
  X,
  LogOut,
  Sun,
  Moon,
  Smartphone,
} from 'lucide-react';
import { useDbUpdate } from './hooks/useDbUpdate';
import { canViewPage, getDefaultPageForRole, PAGE_ACCESS, type AppPage } from './utils/access';
import { VersionBadge } from './components/VersionBadge';
import { WaiterApkInstallModal } from './components/waiter/WaiterApkInstallModal';
import { cn } from './utils/cn';

type Page = AppPage;

// Detect customer table from URL — supports all formats:
//   ?table=3        (query param — most reliable across QR scanners)
//   #table=3        (hash — fallback)
//   ?table=3#other  (mixed)
function getCustomerTableFromUrl(): number | null {
  // 1. Query parameter (survives all redirects, QR scanners, mobile browsers)
  const params = new URLSearchParams(window.location.search);
  const qTable = params.get('table');
  if (qTable && /^\d+$/.test(qTable)) {
    return parseInt(qTable, 10);
  }

  // 2. Hash fragment fallback
  const hash = window.location.hash;
  const hashMatch = hash.match(/#table=(\d+)/);
  if (hashMatch) {
    return parseInt(hashMatch[1], 10);
  }

  return null;
}

const PAGE_NAV_CONFIG: Record<Page, { label: string; icon: React.ReactNode }> = {
  dashboard: { label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  pos: { label: 'POS', icon: <CreditCard size={20} /> },
  orders: { label: 'Orders', icon: <ShoppingCart size={20} /> },
  kitchen: { label: 'Kitchen', icon: <ChefHat size={20} /> },
  tables: { label: 'Tables', icon: <Table2 size={20} /> },
  menu: { label: 'Menu', icon: <UtensilsCrossed size={20} /> },
  inventory: { label: 'Inventory', icon: <Package size={20} /> },
  suppliers: { label: 'Suppliers', icon: <Truck size={20} /> },
  employees: { label: 'Employees', icon: <Users size={20} /> },
  reports: { label: 'Reports', icon: <BarChart3 size={20} /> },
  users: { label: 'Users', icon: <Users size={20} /> },
  settings: { label: 'Settings', icon: <Settings size={20} /> },
};

function AppShell() {
  useDbUpdate();
  const { isAuthenticated, user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [showApkInstallModal, setShowApkInstallModal] = useState(false);
  const [hasCheckedApkPrompt, setHasCheckedApkPrompt] = useState(false);

  // Synchronously ensure browser storage contains no restaurant data for multi-user safety
  useEffect(() => {
    clearBrowserDataStorage();
  }, []);

  // Read URL synchronously on first render so customer page shows immediately
  const [customerTable, setCustomerTable] = useState<number | null>(() => getCustomerTableFromUrl());

  // Listen for URL changes after initial load (hash changes + popstate for query params)
  useEffect(() => {
    const onUrlChange = () => setCustomerTable(getCustomerTableFromUrl());
    window.addEventListener('hashchange', onUrlChange);
    window.addEventListener('popstate', onUrlChange);
    return () => {
      window.removeEventListener('hashchange', onUrlChange);
      window.removeEventListener('popstate', onUrlChange);
    };
  }, []);

  // Initialize sample data & real-time cross-device sync
  useEffect(() => {
    try {
      initializeSampleData();
    } catch (e) {
      console.error('Sample data init error:', e);
    }

    try {
      import('./services/realtimeSync').then(({ realtimeSync }) => {
        realtimeSync.init();
      }).catch(() => {});
    } catch {
      // ignore
    }

    try {
      const lowStockItems = inventoryDB.getLowStock();
      if (lowStockItems.length > 0) {
        const existing = notificationDB
          .getAll()
          .find((item) => item.type === 'inventory' && item.title === 'Low Stock Alert');
        if (!existing) {
          notificationDB.create({
            type: 'inventory',
            title: 'Low Stock Alert',
            message: `${lowStockItems.length} inventory item(s) are below minimum stock.`,
          });
        }
      }
    } catch {
      // ignore
    }

    // Auto-resolve stale waiter calls on startup
    try {
      const notifs = notificationDB.getAll();
      const now = Date.now();
      notifs.forEach((n) => {
        if (!n.isRead && (n.type === 'table' || n.title.toLowerCase().includes('waiter'))) {
          const age = now - new Date(n.createdAt).getTime();
          if (age > 3 * 60 * 1000) {
            notificationDB.markAsRead(n.id);
          }
        }
      });
    } catch {}

    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canViewPage(user.role, currentPage)) {
      setCurrentPage(getDefaultPageForRole(user.role));
    }
  }, [user, currentPage]);

  // Auto-prompt waiter to install Lite APK when opened for the first time in browser
  useEffect(() => {
    if (!bootstrapped || !isAuthenticated || !user || user.role !== 'waiter' || hasCheckedApkPrompt) {
      return;
    }

    setHasCheckedApkPrompt(true);

    // If app is already installed and running in standalone / PWA mode, do not prompt
    const isStandalone =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true);

    if (isStandalone) return;

    // Check if dismissed in this browser session
    try {
      if (sessionStorage.getItem('rms_waiter_apk_prompt_dismissed')) {
        return;
      }
    } catch {
      // ignore
    }

    // Delay prompt slightly for a smooth load transition
    const timer = window.setTimeout(() => {
      setShowApkInstallModal(true);
    }, 600);

    return () => clearTimeout(timer);
  }, [bootstrapped, isAuthenticated, user, hasCheckedApkPrompt]);

  const handleCloseApkModal = () => {
    setShowApkInstallModal(false);
    try {
      sessionStorage.setItem('rms_waiter_apk_prompt_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  const pageTitle = useMemo(() => {
    const titles: Record<Page, string> = {
      dashboard: t('dashboard', 'Restaurant Dashboard'),
      menu: t('menu', 'Menu Management'),
      orders: t('orders', 'Order Management'),
      tables: t('tables', 'Table Management'),
      pos: t('pos', 'Billing & POS'),
      inventory: t('inventory', 'Inventory Management'),
      employees: t('employees', 'Employee Management'),
      reports: t('reports', 'Reports & Analytics'),
      kitchen: t('kitchen', 'Kitchen Display'),
      suppliers: t('suppliers', 'Supplier Management'),
      settings: t('settings', 'Settings'),
      users: t('users', 'User Management'),
    };
    return titles[currentPage] || currentPage;
  }, [currentPage, t]);

  const bottomNavItems = useMemo(() => {
    const profileItem = {
      id: 'profile' as const,
      label: user?.username ? (user.username.length > 8 ? `${user.username.slice(0, 7)}…` : user.username) : t('profile', 'Profile'),
      icon: (
        <div className="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-500 text-white font-black text-[11px] flex items-center justify-center shadow-xs ring-1 ring-white/50">
          {(user?.username || 'U').charAt(0).toUpperCase()}
        </div>
      ),
      isProfile: true,
    };

    const role = user?.role;
    if (!role) {
      return [
        { id: 'dashboard' as const, label: t('dashboard', 'Dashboard'), icon: <LayoutDashboard size={20} />, isProfile: false },
        profileItem,
      ];
    }

    // Include all role-permitted pages so Admin, Manager, Cashier, Waiter, and Chef have complete access on APK & mobile
    const allowedPages = PAGE_ACCESS[role] || ['dashboard'];
    const pageItems = allowedPages.map((pageId) => ({
      id: pageId,
      label: t(pageId, PAGE_NAV_CONFIG[pageId]?.label || pageId),
      icon: PAGE_NAV_CONFIG[pageId]?.icon || <LayoutDashboard size={20} />,
      isProfile: false,
    }));

    return [...pageItems, profileItem];
  }, [user?.role, user?.username, t]);

  if (!bootstrapped) {
    // Show appropriate loading screen based on mode
    if (customerTable !== null) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
              <UtensilsCrossed className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{settingsDB.get().restaurantName}</h1>
            <p className="mt-2 text-sm text-gray-500">Loading menu for Table {customerTable}...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Laptop2 size={30} />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Loading Restaurant Management System</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Preparing offline data, roles, analytics, inventory, and POS modules...
          </p>
        </Card>
      </div>
    );
  }

  // ─── Customer QR Ordering Mode (no login required) ────────────
  if (customerTable !== null) {
    return <CustomerOrderPage tableNumber={customerTable} />;
  }

  // ─── Staff / Admin Mode (login required) ──────────────────────
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'menu':
        return <MenuManagementPage />;
      case 'orders':
        return <OrdersManagementPage />;
      case 'tables':
        return <TableManagementPage />;
      case 'pos':
        return <POSPage />;
      case 'inventory':
        return <InventoryManagementPage />;
      case 'employees':
        return <EmployeeManagementPage />;
      case 'reports':
        return <ReportsPage />;
      case 'kitchen':
        return <KitchenDisplayPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'settings':
        return <SettingsPage />;
      case 'users':
        return <UserManagementPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
      <div className="hidden lg:block">
        <Sidebar
          currentPage={currentPage}
          onPageChange={(page) => setCurrentPage(page)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        />
      </div>

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <Header title={pageTitle} />

        <main className="p-3 sm:p-4 md:p-6 pb-20 lg:pb-6">
          <div className="w-full min-w-0">{renderPage()}</div>
        </main>
      </div>

      {/* Mobile / Tablet Dynamic Bottom Navigation Bar */}
      <nav
        className={cn(
          "lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-lg px-2 py-1.5 flex items-center gap-1",
          bottomNavItems.length <= 5 ? "justify-around" : "justify-start overflow-x-auto no-scrollbar"
        )}
      >
        {bottomNavItems.map((item) => {
          const isProfileItem = 'isProfile' in item && item.isProfile;
          const isActive = !isProfileItem && currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (isProfileItem) {
                  setShowProfilePopup((prev) => !prev);
                } else {
                  setCurrentPage(item.id as Page);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all cursor-pointer shrink-0',
                bottomNavItems.length <= 5 ? 'flex-1' : 'min-w-[62px]',
                isActive || (isProfileItem && showProfilePopup)
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium'
              )}
            >
              <div className={cn('p-1 rounded-lg transition-colors', (isActive || (isProfileItem && showProfilePopup)) ? 'bg-blue-50 dark:bg-blue-950/60' : '')}>
                {item.icon}
              </div>
              <span className="text-[10px] leading-tight mt-0.5 truncate max-w-[58px] text-center">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Staff / Waiter Mobile Profile Popover Modal */}
      {showProfilePopup && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center p-3 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="fixed inset-0"
            onClick={() => setShowProfilePopup(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 mb-16 animate-in slide-in-from-bottom-5 duration-200">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowProfilePopup(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Profile Avatar & Info */}
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                    {user?.username}
                  </h3>
                  <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold px-2 py-0.5 uppercase tracking-wide">
                    {user?.role}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Logged in as {user?.role}
                </p>
              </div>
            </div>

            {/* Quick Role Permitted Navigation Grid for Mobile / Tablet */}
            <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400 px-1">
                <span>Role Permitted Pages</span>
                <span className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-extrabold">{user?.role}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto no-scrollbar p-0.5">
                {bottomNavItems.filter(item => !('isProfile' in item && item.isProfile)).map((pageItem) => {
                  const isActive = currentPage === pageItem.id;
                  return (
                    <button
                      key={pageItem.id}
                      type="button"
                      onClick={() => {
                        setCurrentPage(pageItem.id as Page);
                        setShowProfilePopup(false);
                      }}
                      className={cn(
                        'flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer',
                        isActive
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300 font-bold shadow-xs'
                          : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium'
                      )}
                    >
                      <div className="mb-1">{pageItem.icon}</div>
                      <span className="text-[10px] leading-tight truncate w-full">{pageItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Session / System info */}
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-xs space-y-1.5 border border-gray-100 dark:border-gray-800">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Restaurant</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{settingsDB.get().restaurantName}</span>
              </div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Status</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Session
                </span>
              </div>
            </div>

            {/* Install Lite APK / App Button */}
            <button
              type="button"
              onClick={() => {
                setShowProfilePopup(false);
                setShowApkInstallModal(true);
              }}
              className="w-full flex items-center justify-between p-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-900/50 text-xs font-bold text-blue-700 dark:text-blue-300 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Smartphone size={16} className="text-blue-600 dark:text-blue-400" />
                <span>Install Restaurant Lite APK</span>
              </div>
              <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">Get APK</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-blue-500" />}
                <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </div>
              <span className="text-[11px] text-gray-400 font-normal">Toggle</span>
            </button>

            {/* Logout Button */}
            <Button
              variant="danger"
              className="w-full font-bold py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2"
              onClick={() => {
                setShowProfilePopup(false);
                logout();
              }}
              leftIcon={<LogOut size={16} />}
            >
              Log Out ({user?.username})
            </Button>
          </div>
        </div>
      )}

      {/* Waiter Mobile APK Install Modal */}
      <WaiterApkInstallModal
        isOpen={showApkInstallModal}
        onClose={handleCloseApkModal}
      />

      <VersionBadge />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <NotificationProvider>
            <AuthProvider>
              <AppShell />
            </AuthProvider>
          </NotificationProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

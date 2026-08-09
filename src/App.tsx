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
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';
import { ToastProvider } from './components/ui/Toast';
import { initializeSampleData, inventoryDB, notificationDB, settingsDB } from './database/db';
import { Button } from './components/ui/Button';
import { Card } from './components/ui/Card';
import { AlertTriangle, Bell, Laptop2, UtensilsCrossed } from 'lucide-react';
import { useDbUpdate } from './hooks/useDbUpdate';
import { canViewPage, getDefaultPageForRole, type AppPage } from './utils/access';

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

function useAutoBackup() {
  useEffect(() => {
    const settings = settingsDB.get();
    if (!settings.autoBackup) return;

    const runBackup = () => {
      const snapshot = {
        data: localStorage.getItem('restaurant_db_settings'),
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('restaurant_auto_backup_meta', JSON.stringify(snapshot));
      localStorage.setItem('restaurant_auto_backup_payload', JSON.stringify(localStorage));
    };

    runBackup();
    const interval = window.setInterval(runBackup, Math.max(1, settings.backupInterval) * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);
}

function AppShell() {
  useDbUpdate();
  const { isAuthenticated, user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Read URL synchronously on first render so customer page shows immediately
  const [customerTable, setCustomerTable] = useState<number | null>(() => getCustomerTableFromUrl());

  useAutoBackup();

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

    setBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canViewPage(user.role, currentPage)) {
      setCurrentPage(getDefaultPageForRole(user.role));
    }
  }, [user, currentPage]);

  const pageTitle = useMemo(() => {
    const titles: Record<Page, string> = {
      dashboard: 'Restaurant Dashboard',
      menu: 'Menu Management',
      orders: 'Order Management',
      tables: 'Table Management',
      pos: 'Billing & POS',
      inventory: 'Inventory Management',
      employees: 'Employee Management',
      reports: 'Reports & Analytics',
      kitchen: 'Kitchen Display',
      suppliers: 'Supplier Management',
      settings: 'Application Settings',
      users: 'User Management',
    };
    return titles[currentPage];
  }, [currentPage]);

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
    return (
      <CustomerOrderPage
        tableNumber={customerTable}
        onExit={() => {
          // Clear both query param and hash, navigate to clean URL
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
          setCustomerTable(null);
        }}
      />
    );
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

      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
          <Sidebar
            currentPage={currentPage}
            onPageChange={(page) => {
              setCurrentPage(page);
              setShowMobileSidebar(false);
            }}
            isCollapsed={false}
            onToggleCollapse={() => setShowMobileSidebar(false)}
          />
        </div>
      )}

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <Header title={pageTitle} onMenuClick={() => setShowMobileSidebar(true)} />

        <main className="space-y-6 p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr,320px]">
            <div className="min-w-0">{renderPage()}</div>

            <div className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
              <Card className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Bell size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Quick Tips</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Shortcuts and role-aware guidance</p>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                  <li>• F2 opens table selection in POS.</li>
                  <li>• F3 opens the payment dialog in POS.</li>
                  <li>• Use QR codes on tables for customer self-ordering.</li>
                  <li>• Dashboard and reports update from offline local data.</li>
                  {canViewPage(user?.role, 'settings') && <li>• Use Settings to export or restore backups.</li>}
                </ul>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Logged in as</p>
                  <p className="font-semibold text-gray-900 capitalize dark:text-white">{user?.username} • {user?.role}</p>
                </div>
              </Card>

              <Card className="space-y-3 border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/10">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 text-yellow-600 dark:text-yellow-400" size={18} />
                  <div>
                    <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Offline-first mode</h3>
                    <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                      All restaurant records are stored locally in your browser for fast offline use.
                    </p>
                  </div>
                </div>
                {canViewPage(user?.role, 'settings') && (
                  <Button className="w-full" variant="outline" onClick={() => setCurrentPage('settings')}>
                    Open Data Settings
                  </Button>
                )}
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NotificationProvider>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </NotificationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

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
import { initializeSampleData, inventoryDB, notificationDB, settingsDB, clearBrowserDataStorage } from './database/db';
import { Card } from './components/ui/Card';
import { Laptop2, UtensilsCrossed, Table2, ShoppingCart, CreditCard, ChefHat, LayoutDashboard, Menu } from 'lucide-react';
import { useDbUpdate } from './hooks/useDbUpdate';
import { canViewPage, getDefaultPageForRole, type AppPage } from './utils/access';
import { VersionBadge } from './components/VersionBadge';
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

function AppShell() {
  useDbUpdate();
  const { isAuthenticated, user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

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

  const bottomNavItems = useMemo(() => {
    if (user?.role === 'waiter') {
      return [
        { id: 'tables' as const, label: 'Tables', icon: <Table2 size={20} /> },
        { id: 'pos' as const, label: 'POS', icon: <CreditCard size={20} /> },
        { id: 'orders' as const, label: 'Orders', icon: <ShoppingCart size={20} /> },
        { id: 'more' as const, label: 'More', icon: <Menu size={20} />, isAction: true },
      ];
    }
    if (user?.role === 'chef') {
      return [
        { id: 'kitchen' as const, label: 'Kitchen', icon: <ChefHat size={20} /> },
        { id: 'orders' as const, label: 'Orders', icon: <ShoppingCart size={20} /> },
        { id: 'more' as const, label: 'More', icon: <Menu size={20} />, isAction: true },
      ];
    }
    return [
      { id: 'dashboard' as const, label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
      { id: 'pos' as const, label: 'POS', icon: <CreditCard size={20} /> },
      { id: 'tables' as const, label: 'Tables', icon: <Table2 size={20} /> },
      { id: 'orders' as const, label: 'Orders', icon: <ShoppingCart size={20} /> },
      { id: 'more' as const, label: 'More', icon: <Menu size={20} />, isAction: true },
    ];
  }, [user?.role]);

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

        <main className="p-3 sm:p-4 md:p-6 pb-20 lg:pb-6">
          <div className="w-full min-w-0">{renderPage()}</div>
        </main>
      </div>

      {/* Mobile / Tablet Dynamic Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 shadow-lg px-2 py-1.5 flex items-center justify-around">
        {bottomNavItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if ('isAction' in item && item.isAction) {
                  setShowMobileSidebar(true);
                } else {
                  setCurrentPage(item.id as Page);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer',
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium'
              )}
            >
              <div className={cn('p-1 rounded-lg transition-colors', isActive ? 'bg-blue-50 dark:bg-blue-950/60' : '')}>
                {item.icon}
              </div>
              <span className="text-[11px] leading-tight mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <VersionBadge />
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

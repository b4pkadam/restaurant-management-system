// Database Manager - Using localStorage for offline-first storage
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type {
  User, Employee, Category, MenuItem, Table, Order, Payment,
  Supplier, InventoryItem, PurchaseEntry, DailySales, Notification, AppSettings
} from '../types';
import initialDbData from './initialDbData.json';
const DB_PREFIX = 'restaurant_db_';
const CURRENT_DB_VERSION = 'v4';

// Auto-purge stale browser cache from previous builds
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const installedVersion = localStorage.getItem('restaurant_db_schema_version');
    if (installedVersion !== CURRENT_DB_VERSION) {
      localStorage.removeItem('current_user');
      localStorage.removeItem(DB_PREFIX + 'users');
      localStorage.removeItem(DB_PREFIX + 'settings');
      localStorage.removeItem(DB_PREFIX + 'categories');
      localStorage.removeItem(DB_PREFIX + 'menuItems');
      localStorage.setItem('restaurant_db_schema_version', CURRENT_DB_VERSION);
    }
  } catch {
    // ignore
  }
}

function broadcastSync(action: (sync: typeof import('../services/realtimeSync').realtimeSync) => void) {
  import('../services/realtimeSync').then(({ realtimeSync }) => {
    try {
      action(realtimeSync);
    } catch {
      // ignore
    }
  }).catch(() => {});
}

// Event broadcasting for cross-tab and reactive updates
const listeners = new Set<() => void>();
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('restaurant_db_channel');
    broadcastChannel.onmessage = () => {
      listeners.forEach((cb) => cb());
    };
  }
} catch {
  // Fallback
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(DB_PREFIX)) {
      listeners.forEach((cb) => cb());
    }
  });
  window.addEventListener('db-update', () => {
    listeners.forEach((cb) => cb());
  });
}

export function subscribeDb(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function notifyDbListeners(): void {
  listeners.forEach((cb) => cb());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('db-update'));
  }
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage('db-update');
    } catch {
      // ignore
    }
  }
}

// Generic storage functions
function getCollection<T>(key: string): T[] {
  const data = localStorage.getItem(DB_PREFIX + key);
  return data ? JSON.parse(data) : [];
}

function setCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(DB_PREFIX + key, JSON.stringify(data));
  notifyDbListeners();
}

function getItem<T>(key: string): T | null {
  const data = localStorage.getItem(DB_PREFIX + key);
  return data ? JSON.parse(data) : null;
}

function setItem<T>(key: string, data: T): void {
  localStorage.setItem(DB_PREFIX + key, JSON.stringify(data));
  notifyDbListeners();
}

function safeHashPassword(password: string): string {
  try {
    if (bcrypt && typeof bcrypt.hashSync === 'function') {
      return bcrypt.hashSync(password, 10);
    }
  } catch {
    // Fallback for restricted browser crypto
  }
  return btoa(password);
}

function safeComparePassword(password: string, hash: string): boolean {
  if (!password || !hash) return false;
  const p = password.trim();
  const h = hash.trim();

  // Direct comparison (fastest & handles unhashed seed data)
  if (p === h) return true;
  if (btoa(p) === h) return true;

  // Bcrypt comparison
  if (h.startsWith('$2')) {
    try {
      if (bcrypt && typeof bcrypt.compareSync === 'function') {
        return bcrypt.compareSync(p, h);
      }
    } catch {
      // ignore
    }
  }

  return false;
}

// User Management
export const userDB = {
  getAll: (): User[] => getCollection<User>('users'),
  
  getById: (id: string): User | undefined => {
    return userDB.getAll().find(u => u.id === id);
  },
  
  getByUsername: (username: string): User | undefined => {
    const clean = (username || '').trim().toLowerCase();
    return userDB.getAll().find(u => (u.username || '').trim().toLowerCase() === clean);
  },
  
  create: (user: Omit<User, 'id' | 'createdAt'>): User => {
    const users = userDB.getAll();
    const hashedPassword = safeHashPassword(user.password);
    const newUser: User = {
      ...user,
      id: uuidv4(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    setCollection('users', users);
    return newUser;
  },
  
  update: (id: string, updates: Partial<User>): User | null => {
    const users = userDB.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    
    if (updates.password) {
      updates.password = safeHashPassword(updates.password);
    }
    
    users[index] = { ...users[index], ...updates };
    setCollection('users', users);
    return users[index];
  },
  
  delete: (id: string): boolean => {
    const users = userDB.getAll();
    const filtered = users.filter(u => u.id !== id);
    if (filtered.length === users.length) return false;
    setCollection('users', filtered);
    return true;
  },
  
  authenticate: (username: string, password: string): User | null => {
    const cleanUsername = (username || '').trim();
    const cleanPassword = (password || '').trim();

    let user = userDB.getByUsername(cleanUsername);
    
    // Auto-repair: If user not found in local storage, ensure sample data is seeded
    if (!user) {
      initializeSampleData();
      user = userDB.getByUsername(cleanUsername);
    }

    if (!user || !user.isActive) return null;
    if (!safeComparePassword(cleanPassword, user.password)) return null;
    
    userDB.update(user.id, { lastLogin: new Date().toISOString() });
    return user;
  }
};

// Employee Management
export const employeeDB = {
  getAll: (): Employee[] => getCollection<Employee>('employees'),
  
  getById: (id: string): Employee | undefined => {
    return employeeDB.getAll().find(e => e.id === id);
  },
  
  create: (employee: Omit<Employee, 'id'>): Employee => {
    const employees = employeeDB.getAll();
    const newEmployee: Employee = {
      ...employee,
      id: uuidv4()
    };
    employees.push(newEmployee);
    setCollection('employees', employees);
    return newEmployee;
  },
  
  update: (id: string, updates: Partial<Employee>): Employee | null => {
    const employees = employeeDB.getAll();
    const index = employees.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    employees[index] = { ...employees[index], ...updates };
    setCollection('employees', employees);
    return employees[index];
  },
  
  delete: (id: string): boolean => {
    const employees = employeeDB.getAll();
    const filtered = employees.filter(e => e.id !== id);
    if (filtered.length === employees.length) return false;
    setCollection('employees', filtered);
    return true;
  }
};

// Category Management
export const categoryDB = {
  getAll: (): Category[] => getCollection<Category>('categories'),
  
  getById: (id: string): Category | undefined => {
    return categoryDB.getAll().find(c => c.id === id);
  },
  
  create: (category: Omit<Category, 'id'>): Category => {
    const categories = categoryDB.getAll();
    const newCategory: Category = {
      ...category,
      id: uuidv4()
    };
    categories.push(newCategory);
    setCollection('categories', categories);
    return newCategory;
  },
  
  update: (id: string, updates: Partial<Category>): Category | null => {
    const categories = categoryDB.getAll();
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    categories[index] = { ...categories[index], ...updates };
    setCollection('categories', categories);
    return categories[index];
  },
  
  delete: (id: string): boolean => {
    const categories = categoryDB.getAll();
    const filtered = categories.filter(c => c.id !== id);
    if (filtered.length === categories.length) return false;
    setCollection('categories', filtered);
    return true;
  }
};

// Menu Item Management
export const menuItemDB = {
  getAll: (): MenuItem[] => getCollection<MenuItem>('menuItems'),
  
  getById: (id: string): MenuItem | undefined => {
    return menuItemDB.getAll().find(m => m.id === id);
  },
  
  getByCategory: (categoryId: string): MenuItem[] => {
    return menuItemDB.getAll().filter(m => m.categoryId === categoryId);
  },
  
  getByBarcode: (barcode: string): MenuItem | undefined => {
    return menuItemDB.getAll().find(m => m.barcode === barcode);
  },
  
  create: (item: Omit<MenuItem, 'id' | 'createdAt'>): MenuItem => {
    const items = menuItemDB.getAll();
    const newItem: MenuItem = {
      ...item,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    items.push(newItem);
    setCollection('menuItems', items);
    return newItem;
  },
  
  update: (id: string, updates: Partial<MenuItem>): MenuItem | null => {
    const items = menuItemDB.getAll();
    const index = items.findIndex(m => m.id === id);
    if (index === -1) return null;
    
    items[index] = { ...items[index], ...updates };
    setCollection('menuItems', items);
    return items[index];
  },
  
  delete: (id: string): boolean => {
    const items = menuItemDB.getAll();
    const filtered = items.filter(m => m.id !== id);
    if (filtered.length === items.length) return false;
    setCollection('menuItems', filtered);
    return true;
  }
};

// Table Management
export const tableDB = {
  getAll: (): Table[] => getCollection<Table>('tables'),
  
  getById: (id: string): Table | undefined => {
    return tableDB.getAll().find(t => t.id === id);
  },
  
  getByNumber: (number: number): Table | undefined => {
    return tableDB.getAll().find(t => t.number === number);
  },
  
  create: (table: Omit<Table, 'id'>): Table => {
    const tables = tableDB.getAll();
    const newTable: Table = {
      ...table,
      id: uuidv4()
    };
    tables.push(newTable);
    setCollection('tables', tables);
    return newTable;
  },
  
  update: (id: string, updates: Partial<Table>): Table | null => {
    const tables = tableDB.getAll();
    const index = tables.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    tables[index] = { ...tables[index], ...updates };
    setCollection('tables', tables);
    return tables[index];
  },
  
  delete: (id: string): boolean => {
    const tables = tableDB.getAll();
    const filtered = tables.filter(t => t.id !== id);
    if (filtered.length === tables.length) return false;
    setCollection('tables', filtered);
    return true;
  }
};

// Order Management
export const orderDB = {
  getAll: (): Order[] => getCollection<Order>('orders'),
  
  getById: (id: string): Order | undefined => {
    return orderDB.getAll().find(o => o.id === id);
  },
  
  getByTable: (tableId: string): Order | undefined => {
    return orderDB.getAll().find(o => o.tableId === tableId && o.status !== 'completed' && o.status !== 'cancelled');
  },
  
  getActive: (): Order[] => {
    return orderDB.getAll().filter(o => 
      o.status !== 'completed' && o.status !== 'cancelled'
    );
  },
  
  getToday: (): Order[] => {
    const today = new Date().toISOString().split('T')[0];
    return orderDB.getAll().filter(o => o.createdAt.startsWith(today));
  },
  
  getByDateRange: (start: string, end: string): Order[] => {
    return orderDB.getAll().filter(o => {
      const date = o.createdAt.split('T')[0];
      return date >= start && date <= end;
    });
  },
  
  generateOrderNumber: (type?: string, tableNumber?: number): string => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const todayOrders = orderDB.getToday();
    const orderNum = (todayOrders.length + 1).toString().padStart(3, '0');
    
    let prefix = 'ORD';
    if (type === 'pos') {
      prefix = 'POS';
    } else if (tableNumber) {
      prefix = `TBL-T${String(tableNumber).padStart(2, '0')}`;
    } else if (type === 'takeaway') {
      prefix = 'TAK';
    }
    
    const salt = Math.floor(10 + Math.random() * 90);
    return `${prefix}-${dateStr}-${orderNum}${salt}`;
  },
  
  create: (order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>): Order => {
    const orders = orderDB.getAll();
    let targetTableId = order.tableId;

    if (!targetTableId && order.tableNumber) {
      let existingTable = tableDB.getByNumber(order.tableNumber);
      if (!existingTable) {
        existingTable = tableDB.create({
          number: order.tableNumber,
          capacity: 4,
          status: 'occupied',
          qrCode: `?table=${order.tableNumber}`,
        });
      }
      targetTableId = existingTable.id;
    }

    const newOrder: Order = {
      ...order,
      tableId: targetTableId,
      id: uuidv4(),
      orderNumber: (order as any).orderNumber || orderDB.generateOrderNumber(order.type, order.tableNumber),
      createdAt: new Date().toISOString()
    };
    orders.push(newOrder);
    setCollection('orders', orders);
    
    // Update table status if dine-in
    if (targetTableId) {
      tableDB.update(targetTableId, { 
        status: 'occupied', 
        currentOrderId: newOrder.id 
      });
    }
    
    // Create a system notification for the desktop PC
    const notif = notificationDB.create({
      type: 'order',
      title: `📱 New Order #${newOrder.orderNumber}`,
      message: `Table ${newOrder.tableNumber || 'N/A'} placed a new order for ${newOrder.items.length} item(s).`
    });

    // Broadcast to other physical devices (PC/phones) via WebSocket
    broadcastSync((s) => s.broadcastOrderCreated(newOrder, notif));

    return newOrder;
  },
  
  update: (id: string, updates: Partial<Order>): Order | null => {
    const orders = orderDB.getAll();
    const index = orders.findIndex(o => o.id === id);
    if (index === -1) return null;
    
    orders[index] = { ...orders[index], ...updates };
    setCollection('orders', orders);

    // Free up table automatically if order is completed or cancelled
    if (['completed', 'cancelled'].includes(orders[index].status)) {
      const targetTableId = orders[index].tableId;
      const targetTableNumber = orders[index].tableNumber;
      if (targetTableId) {
        tableDB.update(targetTableId, { status: 'available', currentOrderId: undefined });
      } else if (targetTableNumber) {
        const tbl = tableDB.getByNumber(targetTableNumber);
        if (tbl) {
          tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined });
        }
      }
    }

    // Broadcast status change to other physical devices (customer phone / PC)
    broadcastSync((s) => s.broadcastOrderUpdated(orders[index]));

    return orders[index];
  },
  
  complete: (id: string): Order | null => {
    const order = orderDB.getById(id);
    if (!order) return null;
    
    const updated = orderDB.update(id, { 
      status: 'completed', 
      completedAt: new Date().toISOString() 
    });
    
    // Free up the table
    if (order.tableId) {
      tableDB.update(order.tableId, { 
        status: 'available', 
        currentOrderId: undefined 
      });
    }
    
    return updated;
  },
  
  delete: (id: string): boolean => {
    const orders = orderDB.getAll();
    const filtered = orders.filter(o => o.id !== id);
    if (filtered.length === orders.length) return false;
    setCollection('orders', filtered);
    return true;
  }
};

// Payment Management
export const paymentDB = {
  getAll: (): Payment[] => getCollection<Payment>('payments'),
  
  getById: (id: string): Payment | undefined => {
    return paymentDB.getAll().find(p => p.id === id);
  },
  
  getByOrder: (orderId: string): Payment | undefined => {
    return paymentDB.getAll().find(p => p.orderId === orderId);
  },
  
  getToday: (): Payment[] => {
    const today = new Date().toISOString().split('T')[0];
    return paymentDB.getAll().filter(p => p.createdAt.startsWith(today));
  },
  
  create: (payment: Omit<Payment, 'id' | 'createdAt'>): Payment => {
    const payments = paymentDB.getAll();
    const newPayment: Payment = {
      ...payment,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    payments.push(newPayment);
    setCollection('payments', payments);
    return newPayment;
  },
  
  update: (id: string, updates: Partial<Payment>): Payment | null => {
    const payments = paymentDB.getAll();
    const index = payments.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    payments[index] = { ...payments[index], ...updates };
    setCollection('payments', payments);
    return payments[index];
  }
};

// Supplier Management
export const supplierDB = {
  getAll: (): Supplier[] => getCollection<Supplier>('suppliers'),
  
  getById: (id: string): Supplier | undefined => {
    return supplierDB.getAll().find(s => s.id === id);
  },
  
  create: (supplier: Omit<Supplier, 'id'>): Supplier => {
    const suppliers = supplierDB.getAll();
    const newSupplier: Supplier = {
      ...supplier,
      id: uuidv4()
    };
    suppliers.push(newSupplier);
    setCollection('suppliers', suppliers);
    return newSupplier;
  },
  
  update: (id: string, updates: Partial<Supplier>): Supplier | null => {
    const suppliers = supplierDB.getAll();
    const index = suppliers.findIndex(s => s.id === id);
    if (index === -1) return null;
    
    suppliers[index] = { ...suppliers[index], ...updates };
    setCollection('suppliers', suppliers);
    return suppliers[index];
  },
  
  delete: (id: string): boolean => {
    const suppliers = supplierDB.getAll();
    const filtered = suppliers.filter(s => s.id !== id);
    if (filtered.length === suppliers.length) return false;
    setCollection('suppliers', filtered);
    return true;
  }
};

// Inventory Management
export const inventoryDB = {
  getAll: (): InventoryItem[] => getCollection<InventoryItem>('inventory'),
  
  getById: (id: string): InventoryItem | undefined => {
    return inventoryDB.getAll().find(i => i.id === id);
  },
  
  getLowStock: (): InventoryItem[] => {
    return inventoryDB.getAll().filter(i => i.quantity <= i.minQuantity && i.isActive);
  },
  
  create: (item: Omit<InventoryItem, 'id'>): InventoryItem => {
    const items = inventoryDB.getAll();
    const newItem: InventoryItem = {
      ...item,
      id: uuidv4()
    };
    items.push(newItem);
    setCollection('inventory', items);
    return newItem;
  },
  
  update: (id: string, updates: Partial<InventoryItem>): InventoryItem | null => {
    const items = inventoryDB.getAll();
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return null;
    
    items[index] = { ...items[index], ...updates };
    setCollection('inventory', items);
    return items[index];
  },
  
  addStock: (id: string, quantity: number): InventoryItem | null => {
    const item = inventoryDB.getById(id);
    if (!item) return null;
    
    return inventoryDB.update(id, { 
      quantity: item.quantity + quantity,
      lastRestocked: new Date().toISOString()
    });
  },
  
  delete: (id: string): boolean => {
    const items = inventoryDB.getAll();
    const filtered = items.filter(i => i.id !== id);
    if (filtered.length === items.length) return false;
    setCollection('inventory', filtered);
    return true;
  }
};

// Purchase Entry Management
export const purchaseDB = {
  getAll: (): PurchaseEntry[] => getCollection<PurchaseEntry>('purchases'),
  
  getById: (id: string): PurchaseEntry | undefined => {
    return purchaseDB.getAll().find(p => p.id === id);
  },
  
  create: (purchase: Omit<PurchaseEntry, 'id'>): PurchaseEntry => {
    const purchases = purchaseDB.getAll();
    const newPurchase: PurchaseEntry = {
      ...purchase,
      id: uuidv4()
    };
    purchases.push(newPurchase);
    setCollection('purchases', purchases);
    
    // Update inventory
    inventoryDB.addStock(purchase.inventoryItemId, purchase.quantity);
    
    return newPurchase;
  }
};

// Notification Management
export const notificationDB = {
  getAll: (): Notification[] => getCollection<Notification>('notifications'),
  
  getUnread: (): Notification[] => {
    return notificationDB.getAll().filter(n => !n.isRead);
  },
  
  create: (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>): Notification => {
    const notifications = notificationDB.getAll();
    const newNotification: Notification = {
      ...notification,
      id: uuidv4(),
      isRead: false,
      createdAt: new Date().toISOString()
    };
    notifications.unshift(newNotification);
    // Keep only last 100 notifications
    setCollection('notifications', notifications.slice(0, 100));
    return newNotification;
  },
  
  markAsRead: (id: string): void => {
    const notifications = notificationDB.getAll();
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications[index].isRead = true;
      setCollection('notifications', notifications);
    }
  },
  
  markAllAsRead: (): void => {
    const notifications = notificationDB.getAll().map(n => ({ ...n, isRead: true }));
    setCollection('notifications', notifications);
  },
  
  clear: (): void => {
    setCollection('notifications', []);
  }
};

// Settings Management
export const settingsDB = {
  get: (): AppSettings => {
    const defaultSettings: AppSettings = {
      restaurantName: 'My Restaurant',
      restaurantAddress: '123 Main Street, City',
      restaurantPhone: '+1234567890',
      gstNumber: 'GST123456789',
      taxPercentage: 10,
      currency: 'USD',
      currencySymbol: '$',
      theme: 'light',
      language: 'en',
      autoBackup: true,
      backupInterval: 24
    };
    
    return getItem<AppSettings>('settings') || defaultSettings;
  },
  
  update: (updates: Partial<AppSettings>): AppSettings => {
    const current = settingsDB.get();
    const updated = { ...current, ...updates };
    setItem('settings', updated);
    broadcastSync((s) => s.broadcastSettingsUpdated(updated));
    return updated;
  }
};

// Daily Sales Analytics
export const analyticsDB = {
  getDailySales: (date: string): DailySales => {
    const orders = orderDB.getAll().filter(o => 
      o.createdAt.startsWith(date) && o.status === 'completed'
    );
    const payments = paymentDB.getAll().filter(p => 
      p.createdAt.startsWith(date) && p.status === 'completed'
    );
    
    return {
      date,
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
      totalTax: orders.reduce((sum, o) => sum + o.tax, 0),
      totalDiscount: orders.reduce((sum, o) => sum + o.discount, 0),
      dineInOrders: orders.filter(o => o.type === 'dine-in').length,
      takeawayOrders: orders.filter(o => o.type === 'takeaway').length,
      cashPayments: payments.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0),
      cardPayments: payments.filter(p => p.method === 'card').reduce((sum, p) => sum + p.amount, 0),
      upiPayments: payments.filter(p => p.method === 'upi').reduce((sum, p) => sum + p.amount, 0)
    };
  },
  
  getWeeklySales: (): DailySales[] => {
    const sales: DailySales[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      sales.push(analyticsDB.getDailySales(dateStr));
    }
    return sales;
  },
  
  getMonthlySales: (): DailySales[] => {
    const sales: DailySales[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      sales.push(analyticsDB.getDailySales(dateStr));
    }
    return sales;
  },
  
  getBestSellingItems: (limit: number = 10): { itemId: string; itemName: string; quantity: number; revenue: number }[] => {
    const orders = orderDB.getAll().filter(o => o.status === 'completed');
    const itemStats: { [key: string]: { name: string; quantity: number; revenue: number } } = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!itemStats[item.menuItemId]) {
          itemStats[item.menuItemId] = { name: item.menuItemName, quantity: 0, revenue: 0 };
        }
        itemStats[item.menuItemId].quantity += item.quantity;
        itemStats[item.menuItemId].revenue += item.totalPrice;
      });
    });
    
    return Object.entries(itemStats)
      .map(([itemId, stats]) => ({ itemId, itemName: stats.name, ...stats }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }
};

// Backup & Restore
export const backupDB = {
  export: (): string => {
    const data = {
      users: userDB.getAll(),
      employees: employeeDB.getAll(),
      categories: categoryDB.getAll(),
      menuItems: menuItemDB.getAll(),
      tables: tableDB.getAll(),
      orders: orderDB.getAll(),
      payments: paymentDB.getAll(),
      suppliers: supplierDB.getAll(),
      inventory: inventoryDB.getAll(),
      purchases: purchaseDB.getAll(),
      notifications: notificationDB.getAll(),
      settings: settingsDB.get(),
      exportedAt: new Date().toISOString()
    };
    return JSON.stringify(data, null, 2);
  },
  
  import: (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.users) setCollection('users', data.users);
      if (data.employees) setCollection('employees', data.employees);
      if (data.categories) setCollection('categories', data.categories);
      if (data.menuItems) setCollection('menuItems', data.menuItems);
      if (data.tables) setCollection('tables', data.tables);
      if (data.orders) setCollection('orders', data.orders);
      if (data.payments) setCollection('payments', data.payments);
      if (data.suppliers) setCollection('suppliers', data.suppliers);
      if (data.inventory) setCollection('inventory', data.inventory);
      if (data.purchases) setCollection('purchases', data.purchases);
      if (data.notifications) setCollection('notifications', data.notifications);
      if (data.settings) setItem('settings', data.settings);
      
      return true;
    } catch (error) {
      console.error('Failed to import backup:', error);
      return false;
    }
  },
  
  downloadBackup: (): void => {
    const data = backupDB.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restaurant_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// Initialize with sample data
export const initializeSampleData = (): void => {
  const users = userDB.getAll();
  const hasAdmin = users.some(u => (u.username || '').toLowerCase() === 'admin');

  if (!hasAdmin || users.length === 0) {
    if (initialDbData) {
      try {
        if (initialDbData.settings) setItem('settings', initialDbData.settings);
        if (initialDbData.users) setCollection('users', initialDbData.users);
        if (initialDbData.employees && employeeDB.getAll().length === 0) setCollection('employees', initialDbData.employees);
        if (initialDbData.categories && categoryDB.getAll().length === 0) setCollection('categories', initialDbData.categories);
        if (initialDbData.menuItems && menuItemDB.getAll().length === 0) setCollection('menuItems', initialDbData.menuItems);
        if (initialDbData.tables && tableDB.getAll().length === 0) setCollection('tables', initialDbData.tables);
        if (initialDbData.suppliers && supplierDB.getAll().length === 0) setCollection('suppliers', initialDbData.suppliers);
        if (initialDbData.inventory && inventoryDB.getAll().length === 0) setCollection('inventory', initialDbData.inventory);
        return;
      } catch {
        // Fallback
      }
    }
  }
  
  if (userDB.getAll().length > 0) return;
  userDB.create({
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    isActive: true
  });
  
  // Create sample employees
  const employees = [
    { name: 'John Manager', email: 'john@restaurant.com', phone: '1234567890', role: 'manager' as const, salary: 5000, shift: 'morning' as const, joiningDate: '2023-01-15', isActive: true },
    { name: 'Sarah Waiter', email: 'sarah@restaurant.com', phone: '1234567891', role: 'waiter' as const, salary: 2500, shift: 'evening' as const, joiningDate: '2023-03-20', isActive: true },
    { name: 'Mike Chef', email: 'mike@restaurant.com', phone: '1234567892', role: 'chef' as const, salary: 4000, shift: 'morning' as const, joiningDate: '2022-11-10', isActive: true },
    { name: 'Lisa Cashier', email: 'lisa@restaurant.com', phone: '1234567893', role: 'cashier' as const, salary: 3000, shift: 'flexible' as const, joiningDate: '2023-06-01', isActive: true }
  ];
  employees.forEach(e => employeeDB.create(e));
  
  // Create staff users
  userDB.create({ username: 'manager', password: 'manager123', role: 'manager', isActive: true });
  userDB.create({ username: 'waiter', password: 'waiter123', role: 'waiter', isActive: true });
  userDB.create({ username: 'chef', password: 'chef123', role: 'chef', isActive: true });
  userDB.create({ username: 'cashier', password: 'cashier123', role: 'cashier', isActive: true });
  
  // Create categories from initialDbData
  initialDbData.categories.forEach((c) => categoryDB.create(c as Category));

  // Create menu items from initialDbData
  initialDbData.menuItems.forEach((m) =>
    menuItemDB.create({
      ...m,
      price: Number(m.price),
      isAvailable: m.isAvailable ?? true,
      isVeg: m.isVeg ?? (m as any).isVegetarian ?? true,
      imageUrl: m.imageUrl || (m as any).image,
    } as unknown as MenuItem)
  );
  
  // Create tables
  for (let i = 1; i <= 12; i++) {
    tableDB.create({
      number: i,
      capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6,
      status: 'available',
      floor: i <= 6 ? 1 : 2
    });
  }
  
  // Create suppliers
  const suppliers = [
    { name: 'Fresh Foods Co.', email: 'contact@freshfoods.com', phone: '5551234567', address: '100 Market St', gstNumber: 'GST111222333', isActive: true },
    { name: 'Beverage Distributors', email: 'orders@bevdist.com', phone: '5559876543', address: '200 Industrial Ave', gstNumber: 'GST444555666', isActive: true },
    { name: 'Meat & Poultry Supplies', email: 'sales@meatpoultry.com', phone: '5551112222', address: '300 Farm Road', gstNumber: 'GST777888999', isActive: true }
  ];
  const createdSuppliers = suppliers.map(s => supplierDB.create(s));
  
  // Create inventory items
  const inventoryItems = [
    { name: 'Chicken Breast', unit: 'kg', quantity: 25, minQuantity: 10, costPerUnit: 8.00, supplierId: createdSuppliers[2].id, isActive: true },
    { name: 'Salmon Fillet', unit: 'kg', quantity: 15, minQuantity: 5, costPerUnit: 15.00, supplierId: createdSuppliers[2].id, isActive: true },
    { name: 'Tomatoes', unit: 'kg', quantity: 30, minQuantity: 15, costPerUnit: 2.50, supplierId: createdSuppliers[0].id, isActive: true },
    { name: 'Lettuce', unit: 'kg', quantity: 20, minQuantity: 8, costPerUnit: 3.00, supplierId: createdSuppliers[0].id, isActive: true },
    { name: 'Orange Juice', unit: 'L', quantity: 50, minQuantity: 20, costPerUnit: 4.00, supplierId: createdSuppliers[1].id, isActive: true },
    { name: 'Coffee Beans', unit: 'kg', quantity: 10, minQuantity: 5, costPerUnit: 12.00, supplierId: createdSuppliers[1].id, isActive: true },
    { name: 'Pasta', unit: 'kg', quantity: 40, minQuantity: 15, costPerUnit: 2.00, supplierId: createdSuppliers[0].id, isActive: true },
    { name: 'Mozzarella Cheese', unit: 'kg', quantity: 8, minQuantity: 5, costPerUnit: 10.00, supplierId: createdSuppliers[0].id, isActive: true }
  ];
  inventoryItems.forEach(i => inventoryDB.create(i));
  
  // Create some sample orders for demo
  const allMenuItems = menuItemDB.getAll();
  const sampleOrders = [
    {
      tableId: tableDB.getAll()[0].id,
      tableNumber: 1,
      type: 'dine-in' as const,
      items: [
        { id: uuidv4(), menuItemId: allMenuItems[0].id, menuItemName: allMenuItems[0].name, quantity: 2, unitPrice: allMenuItems[0].price, totalPrice: allMenuItems[0].price * 2, status: 'served' as const },
        { id: uuidv4(), menuItemId: allMenuItems[5].id, menuItemName: allMenuItems[5].name, quantity: 1, unitPrice: allMenuItems[5].price, totalPrice: allMenuItems[5].price, status: 'served' as const }
      ],
      subtotal: 27.97,
      tax: 2.80,
      discount: 0,
      discountType: 'fixed' as const,
      total: 30.77,
      status: 'completed' as const,
      customerName: 'John Doe',
      waiterName: 'Sarah Waiter'
    }
  ];
  
  sampleOrders.forEach(o => {
    const order = orderDB.create(o);
    paymentDB.create({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.total,
      method: 'card',
      status: 'completed',
      receivedBy: 'Lisa Cashier'
    });
  });
  
  // Create welcome notification
  notificationDB.create({
    type: 'system',
    title: 'Welcome to Restaurant Manager',
    message: 'Your restaurant management system is ready to use!'
  });
  
  console.log('Sample data initialized successfully!');
};

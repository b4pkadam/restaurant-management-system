import { APP_VERSION } from '../utils/version';
import type { User, Employee, Category, MenuItem, Table, Order, Payment, Supplier, InventoryItem, Purchase, AppNotification, Settings } from '../types';

export interface ValidatedBackupData {
  users?: User[];
  employees?: Employee[];
  categories?: Category[];
  menuItems?: MenuItem[];
  tables?: Table[];
  orders?: Order[];
  payments?: Payment[];
  suppliers?: Supplier[];
  inventory?: InventoryItem[];
  purchases?: Purchase[];
  notifications?: AppNotification[];
  settings?: Settings;
}

export interface BackupValidationResult {
  valid: boolean;
  data?: ValidatedBackupData;
  error?: string;
}

const KNOWN_COLLECTIONS = [
  'users',
  'employees',
  'categories',
  'menuItems',
  'tables',
  'orders',
  'payments',
  'suppliers',
  'inventory',
  'purchases',
  'notifications',
  'settings',
];

const VALID_USER_ROLES = ['admin', 'manager', 'waiter', 'chef', 'cashier'];
const VALID_TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning'];
const VALID_ORDER_STATUSES = ['active', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
const VALID_PAYMENT_METHODS = ['cash', 'card', 'upi', 'other'];
const VALID_PAYMENT_STATUSES = ['pending', 'completed', 'refunded'];

/**
 * Sanitize strings to strip script tags and dangerous HTML/javascript injection
 */
function sanitizeString(val: any): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

/**
 * Partially mask emails for PII protection
 */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || '*'}*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Partially mask phone numbers for PII protection
 */
function maskPhone(phone: string): string {
  if (!phone) return '';
  const clean = phone.trim();
  if (clean.length <= 4) return '***';
  return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
}

/**
 * Strip passwords and sensitive PII from backup exports
 */
export function sanitizeBackupForExport(rawData: {
  users?: User[];
  employees?: Employee[];
  categories?: Category[];
  menuItems?: MenuItem[];
  tables?: Table[];
  orders?: Order[];
  payments?: Payment[];
  suppliers?: Supplier[];
  inventory?: InventoryItem[];
  purchases?: Purchase[];
  notifications?: AppNotification[];
  settings?: Settings;
}): any {
  const sanitizedUsers = (rawData.users || []).map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    employeeId: u.employeeId,
    isActive: u.isActive,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    password: '[REDACTED]', // NEVER dump password hashes to disk
  }));

  const sanitizedEmployees = (rawData.employees || []).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email ? maskEmail(e.email) : '',
    phone: e.phone ? maskPhone(e.phone) : '',
    role: e.role,
    salary: 0, // Redact salary from plaintext JSON export
    shift: e.shift,
    joiningDate: e.joiningDate,
    isActive: e.isActive,
    address: e.address ? '[REDACTED]' : undefined,
  }));

  const data: ValidatedBackupData = {
    users: sanitizedUsers,
    employees: sanitizedEmployees,
    categories: rawData.categories || [],
    menuItems: rawData.menuItems || [],
    tables: rawData.tables || [],
    orders: rawData.orders || [],
    payments: rawData.payments || [],
    suppliers: rawData.suppliers || [],
    inventory: rawData.inventory || [],
    purchases: rawData.purchases || [],
    notifications: rawData.notifications || [],
    settings: rawData.settings,
  };

  return {
    system: 'Restaurant Management System Lite',
    version: APP_VERSION,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

/**
 * Validate and sanitize an incoming JSON backup file before restoration
 */
export function validateBackupPayload(
  jsonString: string,
  existingContext: {
    existingUsers: User[];
    existingEmployees: Employee[];
  }
): BackupValidationResult {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, error: 'Backup file is empty or invalid.' };
  }

  // 1. Prototype Pollution Defense
  if (/"(?:__proto__|constructor|prototype)"\s*:/i.test(jsonString)) {
    return { valid: false, error: 'Security rejection: Backup contains forbidden prototype properties.' };
  }

  // 2. Parse JSON safely
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    return { valid: false, error: `Malformed JSON: ${err?.message || 'Could not parse backup file.'}` };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Invalid backup structure: root must be a valid JSON object.' };
  }

  // 3. Unwrap wrapped metadata format if present, else fallback to root object for legacy formats
  const rawData =
    parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : parsed;

  const presentCollections = Object.keys(rawData).filter((k) => KNOWN_COLLECTIONS.includes(k));
  if (presentCollections.length === 0) {
    return { valid: false, error: 'Invalid backup: No recognized restaurant collections found in file.' };
  }

  const validated: ValidatedBackupData = {};

  // 4. Validate and sanitize each collection
  try {
    // Categories
    if (rawData.categories !== undefined) {
      if (!Array.isArray(rawData.categories)) {
        return { valid: false, error: "Schema error: 'categories' must be an array." };
      }
      validated.categories = rawData.categories
        .filter((c: any) => c && typeof c === 'object' && c.id && c.name)
        .map((c: any) => ({
          id: String(c.id),
          name: sanitizeString(c.name),
          description: c.description ? sanitizeString(c.description) : undefined,
          icon: c.icon ? sanitizeString(c.icon) : undefined,
          sortOrder: Number(c.sortOrder) || 0,
          isActive: c.isActive !== false,
        }));
    }

    // Menu Items
    if (rawData.menuItems !== undefined) {
      if (!Array.isArray(rawData.menuItems)) {
        return { valid: false, error: "Schema error: 'menuItems' must be an array." };
      }
      validated.menuItems = rawData.menuItems
        .filter((m: any) => m && typeof m === 'object' && m.id && m.name)
        .map((m: any) => ({
          id: String(m.id),
          name: sanitizeString(m.name),
          description: m.description ? sanitizeString(m.description) : undefined,
          categoryId: String(m.categoryId || ''),
          price: Math.max(0, Number(m.price) || 0),
          cost: Math.max(0, Number(m.cost) || 0),
          imageUrl: m.imageUrl ? String(m.imageUrl) : undefined,
          barcode: m.barcode ? sanitizeString(m.barcode) : undefined,
          isAvailable: m.isAvailable !== false,
          isVeg: Boolean(m.isVeg),
          preparationTime: Math.max(1, Number(m.preparationTime) || 15),
          ingredients: Array.isArray(m.ingredients) ? m.ingredients.map(sanitizeString) : [],
          recipe: Array.isArray(m.recipe)
            ? m.recipe
                .filter((r: any) => r && r.inventoryItemId && Number(r.quantity) > 0)
                .map((r: any) => ({
                  inventoryItemId: String(r.inventoryItemId),
                  inventoryItemName: sanitizeString(r.inventoryItemName || ''),
                  quantity: Math.max(0.001, Number(r.quantity) || 1),
                  unit: sanitizeString(r.unit || 'unit'),
                }))
            : undefined,
          allowsSpiceLevel: Boolean(m.allowsSpiceLevel),
          includesDrink: Boolean(m.includesDrink),
          createdAt: m.createdAt || new Date().toISOString(),
        }));
    }

    // Tables
    if (rawData.tables !== undefined) {
      if (!Array.isArray(rawData.tables)) {
        return { valid: false, error: "Schema error: 'tables' must be an array." };
      }
      validated.tables = rawData.tables
        .filter((t: any) => t && typeof t === 'object' && (t.id || t.number !== undefined))
        .map((t: any) => {
          const num = Math.max(1, Number(t.number) || 1);
          const status = VALID_TABLE_STATUSES.includes(t.status) ? t.status : 'available';
          return {
            id: t.id ? String(t.id) : `table_${num}`,
            number: num,
            capacity: Math.max(1, Number(t.capacity) || 4),
            status,
            floor: t.floor !== undefined ? Number(t.floor) : undefined,
            qrCode: t.qrCode ? sanitizeString(t.qrCode) : undefined,
            currentOrderId: t.currentOrderId ? String(t.currentOrderId) : undefined,
            waiterCall: t.waiterCall ? Boolean(t.waiterCall) : undefined,
          };
        });
    }

    // Orders
    if (rawData.orders !== undefined) {
      if (!Array.isArray(rawData.orders)) {
        return { valid: false, error: "Schema error: 'orders' must be an array." };
      }
      validated.orders = rawData.orders
        .filter((o: any) => o && typeof o === 'object' && o.id)
        .map((o: any) => {
          const status = VALID_ORDER_STATUSES.includes(o.status) ? o.status : 'active';
          const items = Array.isArray(o.items)
            ? o.items.map((it: any) => ({
                id: String(it.id || `${it.menuItemId || 'item'}_${Date.now()}`),
                menuItemId: String(it.menuItemId || ''),
                menuItemName: sanitizeString(it.menuItemName || 'Item'),
                quantity: Math.max(1, Number(it.quantity) || 1),
                unitPrice: Math.max(0, Number(it.unitPrice) || 0),
                totalPrice: Math.max(0, Number(it.totalPrice) || 0),
                notes: it.notes ? sanitizeString(it.notes) : undefined,
                spiceLevel: it.spiceLevel || undefined,
                selectedDrink: it.selectedDrink || undefined,
                status: it.status || 'pending',
                inventoryDeducted: Boolean(it.inventoryDeducted),
              }))
            : [];

          return {
            id: String(o.id),
            orderNumber: sanitizeString(o.orderNumber || String(o.id)),
            tableId: o.tableId ? String(o.tableId) : undefined,
            tableNumber: o.tableNumber !== undefined ? Number(o.tableNumber) : undefined,
            type: o.type === 'takeaway' ? 'takeaway' : o.type === 'delivery' ? 'delivery' : 'dine-in',
            items,
            subtotal: Math.max(0, Number(o.subtotal) || 0),
            tax: Math.max(0, Number(o.tax) || 0),
            discount: Math.max(0, Number(o.discount) || 0),
            discountType: o.discountType === 'fixed' ? 'fixed' : 'percentage',
            total: Math.max(0, Number(o.total) || 0),
            status,
            paymentStatus: o.paymentStatus === 'paid' ? 'paid' : 'pending',
            isPaid: Boolean(o.isPaid || o.paymentStatus === 'paid'),
            customerName: o.customerName ? sanitizeString(o.customerName) : undefined,
            customerPhone: o.customerPhone ? sanitizeString(o.customerPhone) : undefined,
            waiterId: o.waiterId ? String(o.waiterId) : undefined,
            waiterName: o.waiterName ? sanitizeString(o.waiterName) : undefined,
            createdAt: o.createdAt || new Date().toISOString(),
            completedAt: o.completedAt || undefined,
            notes: o.notes ? sanitizeString(o.notes) : undefined,
            updatedAt: o.updatedAt || new Date().toISOString(),
            _rev: Number(o._rev) || 1,
          };
        });
    }

    // Payments
    if (rawData.payments !== undefined) {
      if (!Array.isArray(rawData.payments)) {
        return { valid: false, error: "Schema error: 'payments' must be an array." };
      }
      validated.payments = rawData.payments
        .filter((p: any) => p && typeof p === 'object' && p.id && p.orderId)
        .map((p: any) => ({
          id: String(p.id),
          orderId: String(p.orderId),
          orderNumber: sanitizeString(p.orderNumber || ''),
          amount: Math.max(0, Number(p.amount) || 0),
          method: VALID_PAYMENT_METHODS.includes(p.method) ? p.method : 'cash',
          status: VALID_PAYMENT_STATUSES.includes(p.status) ? p.status : 'completed',
          transactionId: p.transactionId ? sanitizeString(p.transactionId) : undefined,
          receivedBy: sanitizeString(p.receivedBy || 'Staff'),
          createdAt: p.createdAt || new Date().toISOString(),
        }));
    }

    // Suppliers
    if (rawData.suppliers !== undefined) {
      if (!Array.isArray(rawData.suppliers)) {
        return { valid: false, error: "Schema error: 'suppliers' must be an array." };
      }
      validated.suppliers = rawData.suppliers
        .filter((s: any) => s && typeof s === 'object' && s.id && s.name)
        .map((s: any) => ({
          id: String(s.id),
          name: sanitizeString(s.name),
          email: sanitizeString(s.email || ''),
          phone: sanitizeString(s.phone || ''),
          address: sanitizeString(s.address || ''),
          gstNumber: s.gstNumber ? sanitizeString(s.gstNumber) : undefined,
          isActive: s.isActive !== false,
        }));
    }

    // Inventory
    if (rawData.inventory !== undefined) {
      if (!Array.isArray(rawData.inventory)) {
        return { valid: false, error: "Schema error: 'inventory' must be an array." };
      }
      validated.inventory = rawData.inventory
        .filter((i: any) => i && typeof i === 'object' && i.id && i.name)
        .map((i: any) => ({
          id: String(i.id),
          name: sanitizeString(i.name),
          category: sanitizeString(i.category || 'General'),
          currentStock: Math.max(0, Number(i.currentStock) || 0),
          unit: sanitizeString(i.unit || 'units'),
          minStockLevel: Math.max(0, Number(i.minStockLevel) || 5),
          costPerUnit: Math.max(0, Number(i.costPerUnit) || 0),
          supplierId: String(i.supplierId || ''),
          lastRestocked: i.lastRestocked || new Date().toISOString(),
        }));
    }

    // Purchases
    if (rawData.purchases !== undefined) {
      if (!Array.isArray(rawData.purchases)) {
        return { valid: false, error: "Schema error: 'purchases' must be an array." };
      }
      validated.purchases = rawData.purchases
        .filter((p: any) => p && typeof p === 'object' && p.id)
        .map((p: any) => ({
          id: String(p.id),
          purchaseNumber: sanitizeString(p.purchaseNumber || String(p.id)),
          supplierId: String(p.supplierId || ''),
          items: Array.isArray(p.items) ? p.items : [],
          totalAmount: Math.max(0, Number(p.totalAmount) || 0),
          paymentStatus: p.paymentStatus === 'paid' ? 'paid' : 'pending',
          invoiceNumber: p.invoiceNumber ? sanitizeString(p.invoiceNumber) : undefined,
          purchasedBy: sanitizeString(p.purchasedBy || 'Admin'),
          date: p.date || new Date().toISOString(),
          notes: p.notes ? sanitizeString(p.notes) : undefined,
        }));
    }

    // Notifications
    if (rawData.notifications !== undefined) {
      if (!Array.isArray(rawData.notifications)) {
        return { valid: false, error: "Schema error: 'notifications' must be an array." };
      }
      validated.notifications = rawData.notifications
        .filter((n: any) => n && typeof n === 'object' && n.id)
        .slice(0, 100)
        .map((n: any) => ({
          id: String(n.id),
          type: n.type || 'info',
          title: sanitizeString(n.title || 'Notification'),
          message: sanitizeString(n.message || ''),
          isRead: Boolean(n.isRead),
          createdAt: n.createdAt || new Date().toISOString(),
        }));
    }

    // Settings
    if (rawData.settings !== undefined) {
      if (typeof rawData.settings !== 'object' || Array.isArray(rawData.settings)) {
        return { valid: false, error: "Schema error: 'settings' must be an object." };
      }
      const s = rawData.settings;
      validated.settings = {
        restaurantName: sanitizeString(s.restaurantName || 'Restaurant'),
        tagline: s.tagline ? sanitizeString(s.tagline) : undefined,
        address: s.address ? sanitizeString(s.address) : '',
        phone: s.phone ? sanitizeString(s.phone) : '',
        email: s.email ? sanitizeString(s.email) : '',
        website: s.website ? sanitizeString(s.website) : undefined,
        gstNumber: s.gstNumber ? sanitizeString(s.gstNumber) : undefined,
        fssaiNumber: s.fssaiNumber ? sanitizeString(s.fssaiNumber) : undefined,
        currency: s.currency ? sanitizeString(s.currency) : '¥',
        currencySymbol: s.currencySymbol ? sanitizeString(s.currencySymbol) : '¥',
        taxPercentage: Math.max(0, Number(s.taxPercentage) || 0),
        serviceChargePercentage: Math.max(0, Number(s.serviceChargePercentage) || 0),
        enableKitchenDisplay: Boolean(s.enableKitchenDisplay ?? true),
        enableTableOrdering: Boolean(s.enableTableOrdering ?? true),
        autoBackup: Boolean(s.autoBackup ?? true),
        backupInterval: Math.max(1, Number(s.backupInterval) || 24),
        restaurantLogo: s.restaurantLogo ? String(s.restaurantLogo) : undefined,
        upiId: s.upiId ? sanitizeString(s.upiId) : undefined,
      };
    }

    // Users (with credential protection and admin preservation)
    if (rawData.users !== undefined) {
      if (!Array.isArray(rawData.users)) {
        return { valid: false, error: "Schema error: 'users' must be an array." };
      }

      const existingUserMap = new Map(
        existingContext.existingUsers.map((u) => [(u.username || '').toLowerCase(), u])
      );

      const parsedUsers: User[] = [];

      for (const u of rawData.users) {
        if (!u || typeof u !== 'object' || !u.username) continue;
        const cleanUsername = sanitizeString(u.username);
        if (!cleanUsername) continue;

        const role = VALID_USER_ROLES.includes(u.role) ? u.role : 'waiter';
        const existing = existingUserMap.get(cleanUsername.toLowerCase());

        // Credential Protection: Preserve existing hashed password if incoming is redacted or empty
        let password = existing?.password;
        if (!password) {
          if (u.password && u.password !== '[REDACTED]') {
            password = u.password;
          } else {
            // Assign a secure random temporary hash if a brand-new user is imported without password
            password = `temp_${Math.random().toString(36).substring(2, 10)}`;
          }
        }

        parsedUsers.push({
          id: String(u.id || `user_${cleanUsername}`),
          username: cleanUsername,
          password,
          role,
          employeeId: u.employeeId ? String(u.employeeId) : undefined,
          isActive: u.isActive !== false,
          createdAt: u.createdAt || new Date().toISOString(),
          lastLogin: u.lastLogin || undefined,
        });
      }

      // Security check: Guarantee at least one active administrator exists
      const hasActiveAdmin = parsedUsers.some((u) => u.role === 'admin' && u.isActive);
      if (!hasActiveAdmin) {
        const existingAdmin = existingContext.existingUsers.find((u) => u.role === 'admin');
        if (existingAdmin) {
          parsedUsers.unshift(existingAdmin);
        } else {
          return { valid: false, error: 'Security rejection: Backup cannot remove all administrator accounts.' };
        }
      }

      validated.users = parsedUsers;
    }

    // Employees (with PII & salary restoration for existing employees)
    if (rawData.employees !== undefined) {
      if (!Array.isArray(rawData.employees)) {
        return { valid: false, error: "Schema error: 'employees' must be an array." };
      }

      const existingEmpMap = new Map(existingContext.existingEmployees.map((e) => [e.id, e]));

      validated.employees = rawData.employees
        .filter((e: any) => e && typeof e === 'object' && e.name)
        .map((e: any) => {
          const empId = String(e.id || `emp_${Date.now()}`);
          const existing = existingEmpMap.get(empId);
          const role = VALID_USER_ROLES.includes(e.role) ? e.role : 'waiter';

          return {
            id: empId,
            name: sanitizeString(e.name),
            // Restore actual phone, email, salary, and address from local record if redacted in backup
            phone:
              existing?.phone ||
              (e.phone && !e.phone.includes('*') ? sanitizeString(e.phone) : ''),
            email:
              existing?.email ||
              (e.email && !e.email.includes('*') ? sanitizeString(e.email) : ''),
            role,
            salary:
              existing?.salary ??
              (typeof e.salary === 'number' && e.salary > 0 ? e.salary : 0),
            shift: e.shift === 'evening' ? 'evening' : e.shift === 'night' ? 'night' : 'morning',
            joiningDate: e.joiningDate || new Date().toISOString().split('T')[0],
            isActive: e.isActive !== false,
            address:
              existing?.address ||
              (e.address && e.address !== '[REDACTED]' ? sanitizeString(e.address) : undefined),
          };
        });
    }

    return { valid: true, data: validated };
  } catch (err: any) {
    return { valid: false, error: `Validation exception: ${err?.message || 'Unexpected schema error'}` };
  }
}

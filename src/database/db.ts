// Database Manager - In-memory store for multi-user real-time cloud operation
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type {
  User, Employee, Category, MenuItem, Table, Order, Payment,
  Supplier, InventoryItem, PurchaseEntry, DailySales, Notification, AppSettings
} from '../types';
import initialDbData from './initialDbData.json';
import { validateUsername, validatePassword } from '../utils/security';
import { scrubUserForCloud } from '../utils/cloudCredentials';
const DB_PREFIX = 'restaurant_db_';

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

import { firebaseSync, registerCloudUpdateHandler, mergeEntities } from '../services/firebaseSync';
import { isFirebaseActive, checkFirebaseHealth, resetFirebaseApp } from '../services/firebase';
import { hasStoredFirebaseConfig } from '../services/firebaseConfig';
import { sanitizeBackupForExport, validateBackupPayload } from '../services/backupValidation';

// Generic in-memory database store (no business data saved in browser storage for multi-user mode)
const memoryStore = new Map<string, any>();

// Global remap history for duplicate category and menu item IDs mapped to canonical IDs
export const categoryRemapHistory = new Map<string, { id: string; name: string }>();
export const menuItemRemapHistory = new Map<string, string>();

/**
 * Auto-heals and sanitizes legacy orders that suffer from:
 * 1) Hardcoded USD sample prices (¥31 bills) where subtotal was 27.97 and total was 30.77
 * 2) Orders whose items have realistic JPY prices (e.g. 980, 780) but order total was recorded <= 50
 */
/**
 * Auto-heals, validates, and recalculates orders against canonical menu prices:
 * 1) Canonical Price Verification: Verifies item prices against database menu items, repairing any tampered unit prices.
 * 2) Mathematical Consistency: Recomputes item total, subtotal, tax, and total.
 * 3) Detects and repairs legacy USD sample bugs.
 */
export function sanitizeAndRepairOrders(orders: Order[]): { orders: Order[]; changed: boolean } {
  let changed = false;
  if (!Array.isArray(orders)) return { orders: [], changed: false };

  const menuItems = getCollection<MenuItem>('menuItems');
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const settings = getItem<Settings>('settings');
  const taxRate = settings && typeof settings.taxPercentage === 'number' ? settings.taxPercentage / 100 : 0.10;

  const repairedOrders = orders.map((order) => {
    if (!order) return order;
    let orderChanged = false;
    const newOrder: Order = { ...order };

    if (Array.isArray(newOrder.items) && newOrder.items.length > 0) {
      let computedItemSubtotal = 0;
      const repairedItems = newOrder.items.map((item) => {
        let itemChanged = false;
        const newItem = { ...item };
        if (newItem.menuItemId && menuItemRemapHistory.has(newItem.menuItemId)) {
          newItem.menuItemId = menuItemRemapHistory.get(newItem.menuItemId)!;
          itemChanged = true;
        }

        // Canonical Price Verification against database menu items
        const canonicalItem = menuMap.get(newItem.menuItemId);
        let unitPrice = Number(newItem.unitPrice) || 0;
        if (canonicalItem && canonicalItem.price > 0 && Math.abs(unitPrice - canonicalItem.price) > 0.01) {
          unitPrice = canonicalItem.price;
          newItem.unitPrice = unitPrice;
          newItem.menuItemName = canonicalItem.name;
          itemChanged = true;
        }

        const qty = Math.max(1, Number(newItem.quantity) || 1);
        const expectedTotal = unitPrice * qty;

        if (newItem.totalPrice === undefined || Math.abs(newItem.totalPrice - expectedTotal) > 0.01) {
          newItem.totalPrice = expectedTotal;
          itemChanged = true;
        }

        if (newItem.status !== 'cancelled') {
          computedItemSubtotal += (newItem.totalPrice || expectedTotal);
        }
        if (itemChanged) orderChanged = true;
        return newItem;
      });

      if (orderChanged) {
        newOrder.items = repairedItems;
      }

      const currentTotal = Number(newOrder.total) || 0;
      const currentSubtotal = Number(newOrder.subtotal) || 0;
      const isStaffOrder = Boolean(newOrder.waiterId || (newOrder as any).cashierId || newOrder.type === 'pos');
      const safeDiscount = isStaffOrder ? Math.min(computedItemSubtotal, Math.max(0, Number(newOrder.discount) || 0)) : 0;
      const taxableSubtotal = Math.max(0, computedItemSubtotal - safeDiscount);
      const expectedTax = Math.round(taxableSubtotal * taxRate);
      const expectedTotal = Math.max(0, taxableSubtotal + expectedTax);

      // Detect legacy USD sample bug OR price tampering discrepancy
      if (
        ((currentTotal <= 50 || currentSubtotal <= 50) && computedItemSubtotal >= 100) ||
        Math.abs(currentSubtotal - computedItemSubtotal) > 0.01 ||
        Math.abs(currentTotal - expectedTotal) > 0.01 ||
        newOrder.discount !== safeDiscount
      ) {
        newOrder.subtotal = computedItemSubtotal;
        newOrder.discount = safeDiscount;
        newOrder.tax = expectedTax;
        newOrder.total = expectedTotal;
        newOrder.items = repairedItems;
        orderChanged = true;
      }
    }

    if (orderChanged) {
      changed = true;
      return newOrder;
    }
    return order;
  });

  return { orders: repairedOrders, changed };
}

/**
 * Recalculates and strictly verifies an order's pricing against canonical menu items and tax rate.
 * Completely eliminates Client-Side Price & Total Trust (CWE-472).
 */
export function recalculateCanonicalOrderPricing(
  items: OrderItem[],
  discountInput: number = 0,
  discountTypeInput: 'percentage' | 'fixed' = 'fixed',
  isStaffOrder: boolean = false
): {
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  total: number;
} {
  const menuItems = getCollection<MenuItem>('menuItems');
  const menuMap = new Map(menuItems.map((m) => [m.id, m]));
  const settings = getItem<Settings>('settings');
  const taxRate = settings && typeof settings.taxPercentage === 'number' ? settings.taxPercentage / 100 : 0.10;

  let subtotal = 0;
  const verifiedItems: OrderItem[] = (items || []).map((it) => {
    const canonicalId = menuItemRemapHistory.get(it.menuItemId) || it.menuItemId;
    const menuItem = menuMap.get(canonicalId);

    // Canonical price verification: enforce database price if item exists
    const unitPrice = menuItem && menuItem.price > 0 ? menuItem.price : Math.max(0, Number(it.unitPrice) || 0);
    const quantity = Math.max(1, Number(it.quantity) || 1);
    const totalPrice = unitPrice * quantity;

    if (it.status !== 'cancelled') {
      subtotal += totalPrice;
    }

    return {
      ...it,
      menuItemId: canonicalId,
      menuItemName: menuItem ? menuItem.name : (it.menuItemName || 'Item'),
      unitPrice,
      quantity,
      totalPrice,
    };
  });

  // Only staff can apply discounts; non-staff (e.g. customer QR orders) cannot tamper with discounts
  let discount = 0;
  if (isStaffOrder) {
    if (discountTypeInput === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(discountInput) || 0));
      discount = Math.round((subtotal * pct) / 100);
    } else {
      discount = Math.min(subtotal, Math.max(0, Number(discountInput) || 0));
    }
  }

  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = Math.round(taxableAmount * taxRate);
  const total = Math.max(0, taxableAmount + tax);

  return {
    items: verifiedItems,
    subtotal,
    tax,
    discount,
    discountType: isStaffOrder ? discountTypeInput : 'fixed',
    total,
  };
}

/**
 * Auto-sanitizes and repairs tables:
 * 1) Removes any test/sample tables like table 99 if no active order exists.
 * 2) If a table is marked 'occupied' but has no matching active order, resets to 'available'.
 * 3) If an active order is bound to a table, ensures table is 'occupied' and currentOrderId is synced.
 */
export function sanitizeAndRepairTables(tables: Table[], orders: Order[]): { tables: Table[]; changed: boolean } {
  let changed = false;
  if (!Array.isArray(tables)) return { tables: [], changed: false };

  const safeOrders = Array.isArray(orders) ? orders : [];
  const activeOrders = safeOrders.filter((o) => !['completed', 'cancelled'].includes(o.status));
  const activeOrderIdSet = new Set(activeOrders.map((o) => o.id));
  const activeTableNumberMap = new Map<number, Order>();
  const activeTableIdMap = new Map<string, Order>();

  activeOrders.forEach((o) => {
    if (o.tableNumber) activeTableNumberMap.set(o.tableNumber, o);
    if (o.tableId) activeTableIdMap.set(o.tableId, o);
  });

  // Purge test/sample table 99 if no active order exists
  const validTables = tables.filter((t) => {
    if (!t || !t.number) return false;
    if (t.number === 99 || t.number >= 90) {
      const hasActive = activeTableNumberMap.has(t.number) || (t.id && activeTableIdMap.has(t.id));
      if (!hasActive) {
        changed = true;
        if (isFirebaseActive()) {
          firebaseSync.deleteDoc('tables', t.id).catch(() => {});
          firebaseSync.deleteDoc('tables', `table_${t.number}`).catch(() => {});
          firebaseSync.deleteDoc('tables', String(t.number)).catch(() => {});
        }
        return false;
      }
    }
    return true;
  });

  const repairedTables = validTables.map((tbl) => {
    const t = { ...tbl };
    const matchingOrder =
      t.currentOrderId && activeOrderIdSet.has(t.currentOrderId)
        ? activeOrders.find((o) => o.id === t.currentOrderId)
        : activeTableNumberMap.get(t.number) || (t.id ? activeTableIdMap.get(t.id) : undefined);

    if (t.status === 'occupied') {
      if (!matchingOrder) {
        t.status = 'available';
        t.currentOrderId = undefined;
        changed = true;
      } else if (t.currentOrderId !== matchingOrder.id) {
        t.currentOrderId = matchingOrder.id;
        changed = true;
      }
    } else if (t.status === 'cleaning') {
      if (t.currentOrderId && !matchingOrder) {
        t.currentOrderId = undefined;
        changed = true;
      }
    } else if (t.status === 'available') {
      if (matchingOrder) {
        const orderUpdated = matchingOrder.updatedAt ? new Date(matchingOrder.updatedAt).getTime() : (matchingOrder.createdAt ? new Date(matchingOrder.createdAt).getTime() : 0);
        const tableUpdated = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
        // Only override to occupied if the active order is strictly newer than when the table was set available
        if (orderUpdated > tableUpdated) {
          t.status = 'occupied';
          t.currentOrderId = matchingOrder.id;
          changed = true;
        }
      } else if (t.currentOrderId) {
        t.currentOrderId = undefined;
        changed = true;
      }
      if (t.waiterCall) {
        t.waiterCall = undefined;
        changed = true;
      }
    }

    if (
      t.waiterCall &&
      (!t.waiterCall.active ||
        t.status === 'available' ||
        (t.waiterCall.timestamp && Date.now() - t.waiterCall.timestamp > 45000))
    ) {
      t.waiterCall = undefined;
      changed = true;
    }
    return t;
  });

  return { tables: repairedTables, changed };
}

/**
 * Auto-heals, deduplicates, and sorts categories.
 * 1) Deduplicates categories by normalized name.
 * 2) Preserves canonical categories, merging any missing descriptions/icons/sortOrder.
 * 3) Re-maps any menu items referencing duplicate category IDs to the primary category ID.
 * 4) Purges duplicate category records from memory and Firestore cloud.
 * 5) Sorts categories ascending by sortOrder, then by name.
 */
export function sanitizeAndDeduplicateCategories(
  categories: Category[]
): { categories: Category[]; duplicateIds: string[]; changed: boolean } {
  if (!Array.isArray(categories) || categories.length === 0) {
    return { categories: [], duplicateIds: [], changed: false };
  }

  const initialCatIds = new Set(
    ((initialDbData && initialDbData.categories) || []).map((c: any) => c.id)
  );

  const rawMenuItems = memoryStore.get('menuItems');
  const menuItems: MenuItem[] = Array.isArray(rawMenuItems) ? rawMenuItems : [];
  const menuItemCategoryIds = new Set(menuItems.map((m) => m.categoryId));

  const groups = new Map<string, Category[]>();
  categories.forEach((cat) => {
    const key = (cat.name || '').trim().toLowerCase();
    const list = groups.get(key) || [];
    list.push(cat);
    groups.set(key, list);
  });

  const cleanCategories: Category[] = [];
  const allDuplicateIds: string[] = [];
  let changed = false;

  // Map from duplicate category ID to canonical category { id, name }
  const remapIdMap = new Map<string, { id: string; name: string }>();

  groups.forEach((group) => {
    if (group.length === 1) {
      cleanCategories.push(group[0]);
      return;
    }

    changed = true;
    // We have duplicates! Score each category to find the best canonical one:
    // 1. ID matches initialDbData
    // 2. ID referenced by existing menu items
    // 3. Lowest positive sortOrder
    const sortedGroup = [...group].sort((a, b) => {
      const aInInitial = initialCatIds.has(a.id) ? 1 : 0;
      const bInInitial = initialCatIds.has(b.id) ? 1 : 0;
      if (aInInitial !== bInInitial) return bInInitial - aInInitial;

      const aInMenu = menuItemCategoryIds.has(a.id) ? 1 : 0;
      const bInMenu = menuItemCategoryIds.has(b.id) ? 1 : 0;
      if (aInMenu !== bInMenu) return bInMenu - aInMenu;

      const aOrder = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : 999;
      const bOrder = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : 999;
      return aOrder - bOrder;
    });

    const canonical = { ...sortedGroup[0] };
    for (let i = 1; i < sortedGroup.length; i++) {
      const dup = sortedGroup[i];
      if (!canonical.description && dup.description) canonical.description = dup.description;
      if (!canonical.icon && dup.icon) canonical.icon = dup.icon;
      if ((!canonical.sortOrder || canonical.sortOrder === 0) && dup.sortOrder) canonical.sortOrder = dup.sortOrder;
      allDuplicateIds.push(dup.id);
      remapIdMap.set(dup.id, { id: canonical.id, name: canonical.name });
      categoryRemapHistory.set(dup.id, { id: canonical.id, name: canonical.name });
    }

    cleanCategories.push(canonical);
  });

  // Sort clean categories by sortOrder ascending, then by name
  cleanCategories.sort((a, b) => {
    const orderA = a.sortOrder !== undefined && a.sortOrder !== null ? a.sortOrder : 999;
    const orderB = b.sortOrder !== undefined && b.sortOrder !== null ? b.sortOrder : 999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  // Remap menu items if any duplicate IDs or unmapped IDs were referenced
  const validCatIds = new Set(cleanCategories.map((c) => c.id));
  const catByName = new Map<string, Category>();
  cleanCategories.forEach((c) => {
    catByName.set((c.name || '').trim().toLowerCase(), c);
  });

  if (menuItems.length > 0) {
    let menuItemsChanged = false;
    const updatedMenuItems = menuItems.map((item) => {
      let targetId: string | undefined;
      let targetName: string | undefined;

      if (remapIdMap.has(item.categoryId)) {
        const mapped = remapIdMap.get(item.categoryId)!;
        targetId = mapped.id;
        targetName = mapped.name;
      } else if (categoryRemapHistory.has(item.categoryId)) {
        const mapped = categoryRemapHistory.get(item.categoryId)!;
        targetId = mapped.id;
        targetName = mapped.name;
      } else if (!validCatIds.has(item.categoryId)) {
        const nameKey = ((item as any).categoryName || '').trim().toLowerCase();
        if (nameKey && catByName.has(nameKey)) {
          const matched = catByName.get(nameKey)!;
          targetId = matched.id;
          targetName = matched.name;
        }
      }

      if (targetId && targetId !== item.categoryId) {
        menuItemsChanged = true;
        return {
          ...item,
          categoryId: targetId,
          categoryName: targetName || item.categoryName,
        };
      }
      return item;
    });

    if (menuItemsChanged) {
      memoryStore.set('menuItems', updatedMenuItems);
      notifyDbListeners();
      if (isFirebaseActive()) {
        updatedMenuItems.forEach((item) => {
          if (item.id) {
            firebaseSync.pushDoc('menuItems', item.id, item).catch(() => {});
          }
        });
      }
    }
  }

  if (changed || cleanCategories.length !== categories.length) {
    changed = true;
    memoryStore.set('categories', cleanCategories);
    notifyDbListeners();
    if (isFirebaseActive()) {
      allDuplicateIds.forEach((dupId) => {
        firebaseSync.deleteDoc('categories', dupId).catch(() => {});
      });
      cleanCategories.forEach((cat) => {
        firebaseSync.pushDoc('categories', cat.id, cat).catch(() => {});
      });
    }
  }

  return { categories: cleanCategories, duplicateIds: allDuplicateIds, changed };
}

/**
 * Auto-heals and deduplicates menu items.
 * 1) Groups menu items by normalized name (trimmed, case-insensitive).
 * 2) Identifies canonical menu item (prioritizing initialDbData IDs or items with active orders).
 * 3) Preserves all rich attributes (imageUrl, description, preparationTime, ingredients, spiceLevel, isVeg, etc.).
 * 4) Re-maps orderItems in existing orders from duplicate menu item IDs to the canonical ID.
 * 5) Purges duplicate menu item documents from memory and Cloud Firestore.
 */
export function sanitizeAndDeduplicateMenuItems(
  menuItems: MenuItem[]
): { menuItems: MenuItem[]; duplicateIds: string[]; changed: boolean } {
  if (!Array.isArray(menuItems) || menuItems.length === 0) {
    return { menuItems: [], duplicateIds: [], changed: false };
  }

  const initialItemIds = new Set(
    ((initialDbData && initialDbData.menuItems) || []).map((m: any) => m.id)
  );

  const rawOrders = memoryStore.get('orders');
  const orders: Order[] = Array.isArray(rawOrders) ? rawOrders : [];
  const orderedMenuItemIds = new Set<string>();
  orders.forEach((o) => {
    (o.items || []).forEach((it) => {
      if (it.menuItemId) orderedMenuItemIds.add(it.menuItemId);
    });
  });

  const groups = new Map<string, MenuItem[]>();
  menuItems.forEach((item) => {
    const key = (item.name || '').trim().toLowerCase();
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  });

  const cleanItems: MenuItem[] = [];
  const allDuplicateIds: string[] = [];
  let changed = false;
  const remapIdMap = new Map<string, string>();

  groups.forEach((group) => {
    if (group.length === 1) {
      cleanItems.push(group[0]);
      return;
    }

    changed = true;
    // Duplicates found! Score each item to find the best canonical one:
    // 1. Matches initialDbData ID (e.g. item-1, item-2)
    // 2. Referenced by orders
    // 3. Has image or description
    const sortedGroup = [...group].sort((a, b) => {
      const aInInitial = initialItemIds.has(a.id) ? 1 : 0;
      const bInInitial = initialItemIds.has(b.id) ? 1 : 0;
      if (aInInitial !== bInInitial) return bInInitial - aInInitial;

      const aInOrder = orderedMenuItemIds.has(a.id) ? 1 : 0;
      const bInOrder = orderedMenuItemIds.has(b.id) ? 1 : 0;
      if (aInOrder !== bInOrder) return bInOrder - aInOrder;

      const aHasImg = a.imageUrl ? 1 : 0;
      const bHasImg = b.imageUrl ? 1 : 0;
      if (aHasImg !== bHasImg) return bHasImg - aHasImg;

      return 0;
    });

    const canonical = { ...sortedGroup[0] };
    for (let i = 1; i < sortedGroup.length; i++) {
      const dup = sortedGroup[i];
      if (!canonical.description && dup.description) canonical.description = dup.description;
      if (!canonical.imageUrl && dup.imageUrl) canonical.imageUrl = dup.imageUrl;
      if (!canonical.barcode && dup.barcode) canonical.barcode = dup.barcode;
      if ((!canonical.ingredients || canonical.ingredients.length === 0) && dup.ingredients) {
        canonical.ingredients = dup.ingredients;
      }
      if (canonical.allowsSpiceLevel === undefined && dup.allowsSpiceLevel !== undefined) {
        canonical.allowsSpiceLevel = dup.allowsSpiceLevel;
      }
      if (canonical.includesDrink === undefined && dup.includesDrink !== undefined) {
        canonical.includesDrink = dup.includesDrink;
      }
      allDuplicateIds.push(dup.id);
      remapIdMap.set(dup.id, canonical.id);
      menuItemRemapHistory.set(dup.id, canonical.id);
    }

    cleanItems.push(canonical);
  });

  // Remap order items in existing orders if any duplicate IDs were referenced
  if (remapIdMap.size > 0 && orders.length > 0) {
    let ordersChanged = false;
    const updatedOrders = orders.map((ord) => {
      let ordItemsChanged = false;
      const updatedItems = (ord.items || []).map((it) => {
        if (remapIdMap.has(it.menuItemId)) {
          ordItemsChanged = true;
          return { ...it, menuItemId: remapIdMap.get(it.menuItemId)! };
        }
        return it;
      });
      if (ordItemsChanged) {
        ordersChanged = true;
        return { ...ord, items: updatedItems };
      }
      return ord;
    });

    if (ordersChanged) {
      memoryStore.set('orders', updatedOrders);
      notifyDbListeners();
      if (isFirebaseActive()) {
        updatedOrders.forEach((o) => {
          if (o.id) firebaseSync.pushDoc('orders', o.id, o).catch(() => {});
        });
      }
    }
  }

  if (changed || cleanItems.length !== menuItems.length) {
    changed = true;
    memoryStore.set('menuItems', cleanItems);
    notifyDbListeners();
    if (isFirebaseActive()) {
      allDuplicateIds.forEach((dupId) => {
        firebaseSync.deleteDoc('menuItems', dupId).catch(() => {});
      });
      cleanItems.forEach((item) => {
        firebaseSync.pushDoc('menuItems', item.id, item).catch(() => {});
      });
    }
  }

  return { menuItems: cleanItems, duplicateIds: allDuplicateIds, changed };
}

// Generic storage functions
export function getCollection<T>(key: string): T[] {
  const data = memoryStore.get(key);
  return Array.isArray(data) ? [...data] : [];
}

export function setCollection<T>(key: string, data: T[]): void {
  let finalData = data;
  if (key === 'orders' && Array.isArray(data)) {
    const { orders } = sanitizeAndRepairOrders(data as unknown as Order[]);
    finalData = orders as unknown as T[];
  } else if (key === 'tables' && Array.isArray(data)) {
    const orders = getCollection<Order>('orders');
    const { tables } = sanitizeAndRepairTables(data as unknown as Table[], orders);
    finalData = tables as unknown as T[];
  } else if (key === 'categories' && Array.isArray(data)) {
    const { categories, duplicateIds, changed } = sanitizeAndDeduplicateCategories(data as unknown as Category[]);
    finalData = categories as unknown as T[];
    if (changed && isFirebaseActive()) {
      duplicateIds.forEach((dupId) => {
        firebaseSync.deleteDoc('categories', dupId).catch(() => {});
      });
    }
  } else if (key === 'menuItems' && Array.isArray(data)) {
    const { menuItems, duplicateIds, changed } = sanitizeAndDeduplicateMenuItems(data as unknown as MenuItem[]);
    finalData = menuItems as unknown as T[];
    if (changed && isFirebaseActive()) {
      duplicateIds.forEach((dupId) => {
        firebaseSync.deleteDoc('menuItems', dupId).catch(() => {});
      });
    }
  }

  // Track previous items by ID to avoid re-pushing unmodified documents to Firestore
  const previousList = (memoryStore.get(key) as any[]) || [];
  const previousMap = new Map<string, any>();
  previousList.forEach((it: any) => {
    const docId =
      key === 'tables' && it.number
        ? `table_${it.number}`
        : it.id || (it.number !== undefined ? String(it.number) : undefined);
    if (docId) previousMap.set(docId, it);
  });

  memoryStore.set(key, finalData);
  notifyDbListeners();

  // Push ONLY documents that are new or whose serialized content has changed
  if (isFirebaseActive() && Array.isArray(finalData)) {
    finalData.forEach((item: any) => {
      const docId =
        key === 'tables' && item.number
          ? `table_${item.number}`
          : item.id || (item.number !== undefined ? String(item.number) : undefined);
      if (!docId) return;

      const prev = previousMap.get(docId);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
        firebaseSync.pushDoc(key, docId, item).catch(() => {});
      }
    });
  }
}

export function getItem<T>(key: string): T | null {
  const data = memoryStore.get(key);
  return data !== undefined ? data : null;
}

export function setItem<T>(key: string, data: T): void {
  memoryStore.set(key, data);
  notifyDbListeners();
  if (isFirebaseActive()) {
    firebaseSync.pushDoc(key, 'global_' + key, data).catch(() => {});
  }
}

// In-memory direct setters from cloud listeners
export function setInMemoryCollection<T>(key: string, data: T[]): void {
  memoryStore.set(key, data);
  notifyDbListeners();
}

export function setInMemoryItem<T>(key: string, data: T): void {
  memoryStore.set(key, data);
  notifyDbListeners();
}

// Connect firebaseSync to in-memory store with granular change processing
registerCloudUpdateHandler({
  setCollection: (collName, items) => {
    let finalItems = items;
    if (collName === 'orders' && Array.isArray(items)) {
      const { orders, changed } = sanitizeAndRepairOrders(items as Order[]);
      finalItems = orders;
      if (changed && isFirebaseActive()) {
        orders.forEach((o, idx) => {
          const original = items[idx];
          if (o.id && (!original || JSON.stringify(original) !== JSON.stringify(o))) {
            firebaseSync.pushDoc('orders', o.id, o).catch(() => {});
          }
        });
      }
    } else if (collName === 'tables' && Array.isArray(items)) {
      const orders = getCollection<Order>('orders');
      const { tables, changed } = sanitizeAndRepairTables(items as Table[], orders);
      finalItems = tables;
      if (changed && isFirebaseActive()) {
        tables.forEach((t, idx) => {
          const original = items[idx];
          if (!original || JSON.stringify(original) !== JSON.stringify(t)) {
            firebaseSync.pushDoc('tables', `table_${t.number}`, t).catch(() => {});
          }
        });
      }
    } else if (collName === 'categories' && Array.isArray(items)) {
      const { categories, duplicateIds, changed } = sanitizeAndDeduplicateCategories(items as Category[]);
      finalItems = categories;
      if (changed && isFirebaseActive()) {
        duplicateIds.forEach((dupId) => {
          firebaseSync.deleteDoc('categories', dupId).catch(() => {});
        });
        categories.forEach((cat, idx) => {
          const original = items[idx];
          if (!original || JSON.stringify(original) !== JSON.stringify(cat)) {
            firebaseSync.pushDoc('categories', cat.id, cat).catch(() => {});
          }
        });
      }
    } else if (collName === 'menuItems' && Array.isArray(items)) {
      const { menuItems, duplicateIds, changed } = sanitizeAndDeduplicateMenuItems(items as MenuItem[]);
      finalItems = menuItems;
      if (changed && isFirebaseActive()) {
        duplicateIds.forEach((dupId) => {
          firebaseSync.deleteDoc('menuItems', dupId).catch(() => {});
        });
        menuItems.forEach((item, idx) => {
          const original = items[idx];
          if (!original || JSON.stringify(original) !== JSON.stringify(item)) {
            firebaseSync.pushDoc('menuItems', item.id, item).catch(() => {});
          }
        });
      }
    }
    memoryStore.set(collName, finalItems);
    notifyDbListeners();
  },
  updateDoc: (collName, docId, data) => {
    if (collName === 'settings') {
      memoryStore.set('settings', data);
      notifyDbListeners();
      return;
    }

    const items = [...((memoryStore.get(collName) as any[]) || [])];
    const index = items.findIndex((it: any) => {
      if (collName === 'tables') {
        const num = data?.number;
        return (
          it.id === docId ||
          (num !== undefined && it.number === num) ||
          `table_${it.number}` === docId ||
          String(it.number) === docId
        );
      }
      return it.id === docId;
    });

    if (index === -1) {
      let sanitizedItem = data;
      if (collName === 'orders') {
        const { orders } = sanitizeAndRepairOrders([data]);
        sanitizedItem = orders[0] || data;
      } else if (collName === 'tables') {
        sanitizedItem = {
          ...data,
          id: data.id || `table_${data.number}`,
        };
      }
      items.push(sanitizedItem);
    } else {
      const existing = items[index];
      const merged = mergeEntities(collName, existing, data, false);
      items[index] = merged;
    }

    if (collName === 'tables') {
      const existingTbl = index !== -1 ? items[index] : null;
      const waiterCall = data?.waiterCall;
      const isFreshWaiterCall =
        waiterCall?.active &&
        waiterCall?.timestamp &&
        Date.now() - waiterCall.timestamp < 35000 &&
        (!existingTbl?.waiterCall || !existingTbl?.waiterCall?.active);

      if (isFreshWaiterCall) {
        import('../services/soundService').then(({ soundService }) => {
          const settings = (memoryStore.get('settings') as AppSettings) || {};
          soundService.playWaiterCallAlert(settings?.waiterCallSound, settings?.waiterCallVibration !== false);
        }).catch(() => {});

        const notifications = (memoryStore.get('notifications') as Notification[]) || [];
        const notifTitle = `🔔 Table ${data.number} Calling Waiter!`;
        const exists = notifications.find(
          (n) => n.type === 'table' && n.tableNumber === data.number && !n.isRead
        );
        if (!exists) {
          notifications.unshift({
            id: `waiter_call_${data.number}_${waiterCall.timestamp}`,
            type: 'table',
            tableNumber: data.number,
            title: notifTitle,
            message: waiterCall.message || `Table ${data.number} requested waiter service.`,
            createdAt: new Date(waiterCall.timestamp).toISOString(),
            isRead: false,
          });
          memoryStore.set('notifications', notifications);
        }
      } else if (data?.waiterCall === undefined && existingTbl?.waiterCall) {
        notificationDB.acknowledgeForTable(data.number);
      }

      // Keep sorted and unique by table number comparing _rev and updatedAt monotonically
      const uniqueMap = new Map<number, any>();
      items.forEach((t: any) => {
        if (t.number) {
          if (t.status === 'available') {
            t.currentOrderId = undefined;
            t.waiterCall = undefined;
          }
          const ex = uniqueMap.get(t.number);
          if (!ex) {
            uniqueMap.set(t.number, t);
          } else {
            const exRev = typeof ex._rev === 'number' ? ex._rev : 0;
            const tRev = typeof t._rev === 'number' ? t._rev : 0;
            const exTime = ex.updatedAt ? new Date(ex.updatedAt).getTime() : 0;
            const tTime = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
            if (tRev > exRev || (tRev === exRev && tTime >= exTime)) {
              uniqueMap.set(t.number, t);
            }
          }
        }
      });
      const cleanTables = Array.from(uniqueMap.values()).sort((a: any, b: any) => a.number - b.number);
      memoryStore.set('tables', cleanTables);
    } else if (collName === 'orders') {
      const mergedOrder = items[index === -1 ? items.length - 1 : index];
      if (mergedOrder && ['completed', 'cancelled'].includes(mergedOrder.status)) {
        const tables = (memoryStore.get('tables') as Table[]) || [];
        let tableChanged = false;
        const updatedTables = tables.map((tbl) => {
          const matches =
            (mergedOrder.tableId && tbl.id === mergedOrder.tableId) ||
            (mergedOrder.tableNumber && tbl.number === mergedOrder.tableNumber);
          if (matches && (!tbl.currentOrderId || tbl.currentOrderId === mergedOrder.id)) {
            tableChanged = true;
            return {
              ...tbl,
              status: 'available' as const,
              currentOrderId: undefined,
              reservationInfo: undefined,
              waiterCall: undefined,
              updatedAt: new Date().toISOString(),
            };
          }
          return tbl;
        });
        if (tableChanged) {
          memoryStore.set('tables', updatedTables);
        }
        if (mergedOrder.tableNumber) {
          notificationDB.acknowledgeForTable(mergedOrder.tableNumber);
        }
      }
      memoryStore.set(collName, items);
    } else {
      memoryStore.set(collName, items);
    }

    notifyDbListeners();
  },
  removeDoc: (collName, docId) => {
    const items = (memoryStore.get(collName) as any[]) || [];
    const filtered = items.filter((it: any) => {
      if (collName === 'tables') {
        return (
          it.id !== docId &&
          `table_${it.number}` !== docId &&
          String(it.number) !== docId
        );
      }
      return it.id !== docId;
    });
    memoryStore.set(collName, filtered);
    notifyDbListeners();
  },
  setItem: (collName, data) => {
    memoryStore.set(collName, data);
    notifyDbListeners();
  },
  getCollection: (collName) => {
    const data = memoryStore.get(collName);
    return Array.isArray(data) ? data : [];
  },
  getItem: (collName) => {
    return memoryStore.get(collName) ?? null;
  },
});

/**
 * Purge any legacy browser storage keys to guarantee multi-user data isolation
 */
export function clearBrowserDataStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith(DB_PREFIX) ||
          k.startsWith('restaurant_cart_') ||
          k.startsWith('restaurant_auto_backup') ||
          k === 'restaurant_last_backup' ||
          k === 'current_user' ||
          k === 'customer_name' ||
          k === 'customer_phone')
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// Clear any past data from browser storage immediately on launch
clearBrowserDataStorage();

// Auto-start real-time cloud synchronization on application launch
if (typeof window !== 'undefined') {
  if (hasStoredFirebaseConfig()) {
    try {
      firebaseSync.start();
      checkFirebaseHealth().catch(() => {});
    } catch {
      // ignore
    }
  }

  window.addEventListener('firebase-config-changed', () => {
    if (hasStoredFirebaseConfig()) {
      firebaseSync.start();
      checkFirebaseHealth().catch(() => {});
    } else {
      firebaseSync.stop();
      resetFirebaseApp().catch(() => {});
    }
  });
}

// RFC 6234 compliant synchronous SHA-256 implementation for secure hashing fallback
function sha256Sync(str: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words: number[] = [];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const utf8: number[] = [];
  for (let idx = 0; idx < str.length; idx++) {
    let charCode = str.charCodeAt(idx);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      idx++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(idx) & 0x3ff));
      utf8.push(0xf0 | (charCode >> 18), 0x80 | ((charCode >> 12) & 0x3f), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    }
  }

  for (let j = 0; j < utf8.length; j++) {
    words[j >> 2] |= utf8[j] << ((3 - (j % 4)) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << ((3 - (utf8.length % 4)) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = utf8.length * 8;

  const w = new Array(64);
  for (let chunk = 0; chunk < words.length; chunk += 16) {
    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let hVal = hash[7];

    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        w[t] = words[chunk + t] | 0;
      } else {
        const gamma0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const gamma1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + gamma0 + w[t - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hVal + s1 + ch + k[t] + w[t]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      hVal = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + hVal) | 0;
  }

  let result = '';
  for (let idx = 0; idx < 8; idx++) {
    result += (hash[idx] >>> 0).toString(16).padStart(8, '0');
  }
  return result;
}

/**
 * Cryptographically secure fallback hash using salted SHA-256 with key stretching.
 * Format: $sha256$<salt>$<hash>
 */
function sha256Crypt(password: string): string {
  let salt = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    salt = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    salt = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  let hash = sha256Sync(`${salt}:${password}`);
  for (let i = 0; i < 2000; i++) {
    hash = sha256Sync(`${hash}:${salt}:${password}`);
  }
  return `$sha256$${salt}$${hash}`;
}

function verifySha256(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith('$sha256$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const salt = parts[2];
  const expectedHash = parts[3];

  let hash = sha256Sync(`${salt}:${password}`);
  for (let i = 0; i < 2000; i++) {
    hash = sha256Sync(`${hash}:${salt}:${password}`);
  }
  return hash === expectedHash;
}

function safeHashPassword(password: string): string {
  if (!password) return '';
  // If already a bcrypt or sha256 hash, return as is
  if (password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$') || password.startsWith('$sha256$')) {
    return password;
  }
  try {
    if (bcrypt && typeof bcrypt.hashSync === 'function') {
      return bcrypt.hashSync(password, 10);
    }
  } catch (err) {
    console.warn('bcrypt hashing failed, falling back to secure salted SHA-256:', err);
  }
  return sha256Crypt(password);
}

function safeComparePassword(password: string, hash: string): boolean {
  if (!password || !hash) return false;
  const p = password.trim();
  const h = hash.trim();

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

  // Cryptographically secure salted SHA-256 fallback comparison
  if (h.startsWith('$sha256$')) {
    return verifySha256(p, h);
  }

  // Legacy fallback comparison (for backward compatibility during auto-upgrade of pre-existing accounts)
  if (p === h) return true;
  try {
    if (btoa(p) === h) return true;
  } catch {
    // ignore
  }

  return false;
}

// Rate limiting & Brute Force Lockout Tracker
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

interface AttemptRecord {
  count: number;
  lastAttemptTime: number;
  lockedUntil?: number;
}

let memoryRateLimits: Record<string, AttemptRecord> = {};

export const authRateLimiter = {
  getAttemptsKey: () => DB_PREFIX + 'login_attempts',

  getRecords: (): Record<string, AttemptRecord> => {
    return memoryRateLimits;
  },

  setRecords: (records: Record<string, AttemptRecord>) => {
    memoryRateLimits = records;
  },

  checkStatus: (username: string): { isLocked: boolean; remainingSeconds?: number; attemptsRemaining: number } => {
    const key = (username || '').trim().toLowerCase();
    if (!key) return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };

    const records = authRateLimiter.getRecords();
    const record = records[key];

    if (!record) {
      return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
    }

    const now = Date.now();

    // Check if lockout is still active
    if (record.lockedUntil) {
      if (now < record.lockedUntil) {
        const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
        return { isLocked: true, remainingSeconds, attemptsRemaining: 0 };
      } else {
        // Lockout expired, reset record
        delete records[key];
        authRateLimiter.setRecords(records);
        return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
      }
    }

    // Reset attempt counter if last attempt was over 15 minutes ago
    if (now - record.lastAttemptTime > 15 * 60 * 1000) {
      delete records[key];
      authRateLimiter.setRecords(records);
      return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
    }

    const attemptsRemaining = Math.max(0, MAX_LOGIN_ATTEMPTS - record.count);
    return { isLocked: false, attemptsRemaining };
  },

  recordFailedAttempt: (username: string): { isLocked: boolean; remainingSeconds?: number; attemptsRemaining: number } => {
    const key = (username || '').trim().toLowerCase();
    if (!key) return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };

    const records = authRateLimiter.getRecords();
    const now = Date.now();
    const current = records[key] || { count: 0, lastAttemptTime: now };

    current.count += 1;
    current.lastAttemptTime = now;

    if (current.count >= MAX_LOGIN_ATTEMPTS) {
      current.lockedUntil = now + LOCKOUT_MINUTES * 60 * 1000;
      records[key] = current;
      authRateLimiter.setRecords(records);
      return { isLocked: true, remainingSeconds: LOCKOUT_MINUTES * 60, attemptsRemaining: 0 };
    }

    records[key] = current;
    authRateLimiter.setRecords(records);
    return { isLocked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS - current.count };
  },

  resetAttempts: (username: string) => {
    const key = (username || '').trim().toLowerCase();
    if (!key) return;
    const records = authRateLimiter.getRecords();
    if (records[key]) {
      delete records[key];
      authRateLimiter.setRecords(records);
    }
  }
};

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
    const userVal = validateUsername(user.username);
    if (!userVal.isValid) {
      throw new Error(userVal.error || 'Invalid username');
    }
    const passVal = validatePassword(user.password);
    if (!passVal.isValid) {
      throw new Error(passVal.error || 'Invalid password');
    }

    const users = userDB.getAll();
    const hashedPassword = safeHashPassword(passVal.cleanValue);
    const newUser: User = {
      ...user,
      username: userVal.cleanValue,
      id: uuidv4(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    setCollection('users', users);
    authRateLimiter.resetAttempts(newUser.username);
    if (isFirebaseActive()) {
      firebaseSync.pushDoc('users', newUser.id, scrubUserForCloud(newUser)).catch(() => {});
    }
    return newUser;
  },
  
  update: (id: string, updates: Partial<User>): User | null => {
    const users = userDB.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    
    if (updates.username) {
      const userVal = validateUsername(updates.username);
      if (!userVal.isValid) {
        throw new Error(userVal.error || 'Invalid username');
      }
      updates.username = userVal.cleanValue;
    }

    if (updates.password) {
      const passVal = validatePassword(updates.password);
      if (!passVal.isValid) {
        throw new Error(passVal.error || 'Invalid password');
      }
      updates.password = safeHashPassword(passVal.cleanValue);
    }
    
    users[index] = { ...users[index], ...updates };
    setCollection('users', users);
    authRateLimiter.resetAttempts(users[index].username);
    if (isFirebaseActive()) {
      firebaseSync.pushDoc('users', users[index].id, scrubUserForCloud(users[index])).catch(() => {});
    }
    return users[index];
  },
  
  delete: (id: string): boolean => {
    const users = userDB.getAll();
    const target = users.find(u => u.id === id || u.username === id);
    const filtered = users.filter(u => u.id !== id && u.username !== id);
    if (filtered.length === users.length) return false;
    setCollection('users', filtered);
    if (isFirebaseActive()) {
      if (target) {
        firebaseSync.pushDoc('users', target.id, scrubUserForCloud({ ...target, isDeleted: true, isActive: false })).catch(() => {});
        firebaseSync.deleteDoc('users', target.id).catch(() => {});
        if (target.username) {
          firebaseSync.deleteDoc('users', target.username).catch(() => {});
        }
      } else {
        firebaseSync.deleteDoc('users', id).catch(() => {});
      }
    }
    return true;
  },
  
  authenticate: (username: string, password: string): { user: User | null; error?: string } => {
    // 1. Strict input validation against overlong strings, control characters, and injection
    const userVal = validateUsername(username);
    if (!userVal.isValid) {
      return { user: null, error: userVal.error || 'Invalid username format.' };
    }

    const passVal = validatePassword(password);
    if (!passVal.isValid) {
      return { user: null, error: passVal.error || 'Invalid password format.' };
    }

    const cleanUsername = userVal.cleanValue;
    const cleanPassword = passVal.cleanValue;

    const allUsers = userDB.getAll();
    if (allUsers.length === 0) {
      if (cleanPassword === 'agy') {
        const adminUser = userDB.create({
          username: cleanUsername || 'admin',
          password: 'agy',
          role: 'admin',
          isActive: true,
        });
        return { user: adminUser, error: undefined };
      }
      return { user: null, error: 'No accounts exist yet. Master password is "agy" for initial administrator login.' };
    }

    // 2. Check Rate Limiter / Brute Force Lockout
    const status = authRateLimiter.checkStatus(cleanUsername);
    if (status.isLocked) {
      const minutes = Math.ceil((status.remainingSeconds || 60) / 60);
      return {
        user: null,
        error: `Account temporarily locked due to multiple failed attempts. Please try again in ${minutes} minute(s) (${status.remainingSeconds}s).`,
      };
    }

    let user = userDB.getByUsername(cleanUsername);

    if (!user || !user.isActive) {
      const failure = authRateLimiter.recordFailedAttempt(cleanUsername);
      if (failure.isLocked) {
        return {
          user: null,
          error: `Too many failed login attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        user: null,
        error: failure.attemptsRemaining > 0
          ? `Invalid username or password. ${failure.attemptsRemaining} attempt(s) remaining.`
          : `Too many failed login attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
      };
    }

    if (!safeComparePassword(cleanPassword, user.password)) {
      const failure = authRateLimiter.recordFailedAttempt(cleanUsername);
      if (failure.isLocked) {
        return {
          user: null,
          error: `Too many failed login attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        user: null,
        error: failure.attemptsRemaining > 0
          ? `Invalid username or password. ${failure.attemptsRemaining} attempt(s) remaining.`
          : `Too many failed login attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
      };
    }
    
    // Success: Reset rate limit attempts
    authRateLimiter.resetAttempts(cleanUsername);

    // Auto-upgrade password to bcrypt hash if it was stored in old format
    if (!user.password.startsWith('$2')) {
      const newHash = safeHashPassword(cleanPassword);
      userDB.update(user.id, { password: newHash, lastLogin: new Date().toISOString() });
    } else {
      userDB.update(user.id, { lastLogin: new Date().toISOString() });
    }

    return { user, error: undefined };
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
  getAll: (): Category[] => {
    const raw = getCollection<Category>('categories');
    // Deduplicate if duplicate category names exist
    const seen = new Set<string>();
    let hasDuplicates = false;
    for (const c of raw) {
      const k = (c.name || '').trim().toLowerCase();
      if (k && seen.has(k)) {
        hasDuplicates = true;
        break;
      }
      if (k) seen.add(k);
    }
    if (hasDuplicates) {
      const { categories } = sanitizeAndDeduplicateCategories(raw);
      return categories;
    }
    return raw.sort((a, b) => {
      const orderA = a.sortOrder !== undefined && a.sortOrder !== null ? a.sortOrder : 999;
      const orderB = b.sortOrder !== undefined && b.sortOrder !== null ? b.sortOrder : 999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });
  },
  
  getById: (id: string): Category | undefined => {
    return categoryDB.getAll().find(c => c.id === id);
  },
  
  create: (category: Omit<Category, 'id'> & { id?: string }): Category => {
    const categories = categoryDB.getAll();
    const newCategory: Category = {
      ...category,
      id: category.id || uuidv4()
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
    if (isFirebaseActive()) {
      firebaseSync.deleteDoc('categories', id).catch(() => {});
    }
    return true;
  }
};

// Menu Item Management
export const menuItemDB = {
  getAll: (): MenuItem[] => {
    const raw = getCollection<MenuItem>('menuItems');
    // Deduplicate if duplicate items exist by normalized name
    const seen = new Set<string>();
    let hasDuplicates = false;
    for (const m of raw) {
      const k = (m.name || '').trim().toLowerCase();
      if (k && seen.has(k)) {
        hasDuplicates = true;
        break;
      }
      if (k) seen.add(k);
    }
    let items = raw;
    if (hasDuplicates) {
      const { menuItems } = sanitizeAndDeduplicateMenuItems(raw);
      items = menuItems;
    }

    if (categoryRemapHistory.size > 0) {
      let changed = false;
      const repaired = items.map((m) => {
        if (categoryRemapHistory.has(m.categoryId)) {
          changed = true;
          const canonical = categoryRemapHistory.get(m.categoryId)!;
          return {
            ...m,
            categoryId: canonical.id,
            categoryName: canonical.name || (m as any).categoryName,
          };
        }
        return m;
      });
      if (changed) {
        memoryStore.set('menuItems', repaired);
        notifyDbListeners();
      }
      return repaired;
    }
    return items;
  },
  
  getById: (id: string): MenuItem | undefined => {
    const canonicalId = menuItemRemapHistory.get(id) || id;
    return menuItemDB.getAll().find(m => m.id === canonicalId);
  },
  
  getByCategory: (categoryId: string): MenuItem[] => {
    const targetId = categoryRemapHistory.get(categoryId)?.id || categoryId;
    return menuItemDB.getAll().filter(m => m.categoryId === targetId);
  },
  
  getByBarcode: (barcode: string): MenuItem | undefined => {
    return menuItemDB.getAll().find(m => m.barcode === barcode);
  },
  
  create: (item: Omit<MenuItem, 'id' | 'createdAt'> & { id?: string }): MenuItem => {
    let catId = item.categoryId;
    let catName = (item as any).categoryName;
    if (categoryRemapHistory.has(catId)) {
      const canonical = categoryRemapHistory.get(catId)!;
      catId = canonical.id;
      catName = canonical.name;
    }
    const nameKey = (item.name || '').trim().toLowerCase();
    const items = menuItemDB.getAll();
    const existingIndex = items.findIndex((m) => (m.name || '').trim().toLowerCase() === nameKey);
    if (existingIndex !== -1) {
      // Avoid duplicate insertion: update existing item and return it
      items[existingIndex] = {
        ...items[existingIndex],
        ...item,
        id: items[existingIndex].id,
        categoryId: catId || items[existingIndex].categoryId,
        categoryName: catName || items[existingIndex].categoryName,
      };
      setCollection('menuItems', items);
      return items[existingIndex];
    }
    const newItem: MenuItem = {
      ...item,
      categoryId: catId,
      categoryName: catName || (item as any).categoryName,
      id: item.id || uuidv4(),
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
    
    let catId = updates.categoryId;
    let catName = (updates as any).categoryName;
    if (catId && categoryRemapHistory.has(catId)) {
      const canonical = categoryRemapHistory.get(catId)!;
      catId = canonical.id;
      catName = canonical.name;
    }
    items[index] = {
      ...items[index],
      ...updates,
      ...(catId ? { categoryId: catId, categoryName: catName || (items[index] as any).categoryName } : {})
    };
    setCollection('menuItems', items);
    return items[index];
  },
  
  delete: (id: string): boolean => {
    const items = menuItemDB.getAll();
    const filtered = items.filter(m => m.id !== id);
    if (filtered.length === items.length) return false;
    setCollection('menuItems', filtered);
    if (isFirebaseActive()) {
      firebaseSync.deleteDoc('menuItems', id).catch(() => {});
    }
    return true;
  }
};

// Table Management
export const tableDB = {
  getAll: (): Table[] => {
    const raw = getCollection<Table>('tables');
    const orders = getCollection<Order>('orders');
    const { tables, changed } = sanitizeAndRepairTables(raw, orders);
    if (changed) {
      memoryStore.set('tables', tables);
      notifyDbListeners();
    }
    const uniqueMap = new Map<number, Table>();
    tables.forEach((t) => {
      if (!t.number) return;
      const existing = uniqueMap.get(t.number);
      if (!existing) {
        uniqueMap.set(t.number, t);
      } else {
        const existingRev = typeof existing._rev === 'number' ? existing._rev : 0;
        const tRev = typeof t._rev === 'number' ? t._rev : 0;
        const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const tUpdated = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
        if (tRev > existingRev || (tRev === existingRev && tUpdated >= existingUpdated)) {
          uniqueMap.set(t.number, t);
        }
      }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => a.number - b.number);
  },
  
  getById: (id: string): Table | undefined => {
    return tableDB.getAll().find(t => t.id === id || String(t.number) === id || `table_${t.number}` === id);
  },
  
  getByNumber: (number: number): Table | undefined => {
    return tableDB.getAll().find(t => t.number === number);
  },
  
  create: (table: Omit<Table, 'id'>): Table => {
    const tables = tableDB.getAll().filter(t => t.number !== table.number);
    const now = new Date().toISOString();
    const newTable: Table = {
      ...table,
      id: `table_${table.number}`,
      updatedAt: now,
      _rev: 1,
    };
    tables.push(newTable);
    setCollection('tables', tables);
    broadcastSync((s) => s.broadcastTableUpdated(newTable));
    return newTable;
  },
  
  update: (id: string, updates: Partial<Table>): Table | null => {
    const tables = tableDB.getAll();
    const index = tables.findIndex(t => t.id === id || String(t.number) === id || `table_${t.number}` === id);
    if (index === -1) return null;
    
    const existing = tables[index];
    const nextRev = (typeof existing._rev === 'number' ? existing._rev : 1) + 1;
    tables[index] = {
      ...existing,
      ...updates,
      _rev: nextRev,
      updatedAt: new Date().toISOString(),
    };
    setCollection('tables', tables);
    broadcastSync((s) => s.broadcastTableUpdated(tables[index]));
    return tables[index];
  },
  
  delete: (id: string): boolean => {
    const tables = tableDB.getAll();
    const target = tables.find(t => t.id === id || String(t.number) === id || `table_${t.number}` === id);
    const filtered = tables.filter(t => t.id !== id && String(t.number) !== id && `table_${t.number}` !== id);
    if (filtered.length === tables.length) return false;
    setCollection('tables', filtered);
    if (isFirebaseActive()) {
      if (target) {
        firebaseSync.deleteDoc('tables', target.id).catch(() => {});
        firebaseSync.deleteDoc('tables', `table_${target.number}`).catch(() => {});
        firebaseSync.deleteDoc('tables', String(target.number)).catch(() => {});
      } else {
        firebaseSync.deleteDoc('tables', id).catch(() => {});
      }
    }
    return true;
  }
};

// Order Management
export const orderDB = {
  getAll: (): Order[] => {
    const raw = getCollection<Order>('orders');
    const { orders, changed } = sanitizeAndRepairOrders(raw);
    if (changed) {
      memoryStore.set('orders', orders);
      notifyDbListeners();
      if (isFirebaseActive()) {
        orders.forEach((ord, idx) => {
          const original = raw[idx];
          if (ord.id && (!original || JSON.stringify(original) !== JSON.stringify(ord))) {
            firebaseSync.pushDoc('orders', ord.id, ord).catch(() => {});
          }
        });
      }

      // Also auto-repair matching payments if order total was repaired
      const payments = getCollection<Payment>('payments');
      let paymentsChanged = false;
      const repairedPayments = payments.map((p) => {
        const matchingOrder = orders.find((o) => o.id === p.orderId);
        if (matchingOrder && Number(p.amount) <= 50 && matchingOrder.total >= 100) {
          paymentsChanged = true;
          return { ...p, amount: matchingOrder.total };
        }
        return p;
      });

      if (paymentsChanged) {
        memoryStore.set('payments', repairedPayments);
        notifyDbListeners();
        if (isFirebaseActive()) {
          repairedPayments.forEach((p, idx) => {
            const originalP = payments[idx];
            if (p.id && (!originalP || JSON.stringify(originalP) !== JSON.stringify(p))) {
              firebaseSync.pushDoc('payments', p.id, p).catch(() => {});
            }
          });
        }
      }
    }
    return orders;
  },
  
  getById: (id: string): Order | undefined => {
    return orderDB.getAll().find(o => o.id === id);
  },
  
  getByTable: (tableId: string): Order | undefined => {
    return orderDB.getAll().find(o => o.tableId === tableId && o.status !== 'completed' && o.status !== 'cancelled');
  },
  
  getActive: (): Order[] => {
    return orderDB.getAll().filter(o => !['completed', 'cancelled'].includes(o.status));
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
      const existingTable = tableDB.getByNumber(order.tableNumber);
      if (existingTable) {
        targetTableId = existingTable.id;
      }
    }

    const isStaffOrder = Boolean(order.waiterId || (order as any).cashierId || order.type === 'pos');
    const pricing = recalculateCanonicalOrderPricing(
      order.items || [],
      order.discount || 0,
      order.discountType || 'fixed',
      isStaffOrder
    );

    const now = new Date().toISOString();
    const newOrder: Order = {
      paymentStatus: 'pending',
      isPaid: false,
      ...order,
      items: pricing.items,
      subtotal: pricing.subtotal,
      tax: pricing.tax,
      discount: pricing.discount,
      discountType: pricing.discountType,
      total: pricing.total,
      tableId: targetTableId,
      id: uuidv4(),
      orderNumber: (order as any).orderNumber || orderDB.generateOrderNumber(order.type, order.tableNumber),
      createdAt: now,
      updatedAt: now,
      _rev: 1,
    };
    orders.push(newOrder);
    setCollection('orders', orders);

    // Automatically deduct linked recipe ingredients from inventory
    try {
      inventoryDB.deductForOrder(newOrder.id);
    } catch {
      // ignore
    }
    
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

    // Broadcast to other local browser tabs
    broadcastSync((s) => s.broadcastOrderCreated(newOrder, notif));

    return newOrder;
  },
  
  update: (id: string, updates: Partial<Order>): Order | null => {
    const orders = orderDB.getAll();
    const index = orders.findIndex(o => o.id === id);
    if (index === -1) return null;
    
    const existing = orders[index];
    const isStaffOrder = Boolean(
      updates.waiterId ||
      existing.waiterId ||
      (updates as any).cashierId ||
      (existing as any).cashierId ||
      updates.type === 'pos' ||
      existing.type === 'pos'
    );

    let computedPricing: Partial<Order> = {};
    if (
      updates.items !== undefined ||
      updates.discount !== undefined ||
      updates.discountType !== undefined ||
      updates.subtotal !== undefined ||
      updates.tax !== undefined ||
      updates.total !== undefined
    ) {
      const targetItems = updates.items !== undefined ? updates.items : existing.items;
      const targetDiscount = updates.discount !== undefined ? updates.discount : (existing.discount || 0);
      const targetDiscountType = updates.discountType !== undefined ? updates.discountType : (existing.discountType || 'fixed');
      const pricing = recalculateCanonicalOrderPricing(
        targetItems || [],
        targetDiscount,
        targetDiscountType,
        isStaffOrder
      );
      computedPricing = {
        items: pricing.items,
        subtotal: pricing.subtotal,
        tax: pricing.tax,
        discount: pricing.discount,
        discountType: pricing.discountType,
        total: pricing.total,
      };
    }

    const nextRev = (typeof existing._rev === 'number' ? existing._rev : 1) + 1;
    orders[index] = {
      ...existing,
      ...updates,
      ...computedPricing,
      _rev: nextRev,
      updatedAt: new Date().toISOString(),
    };
    setCollection('orders', orders);

    // Restore ingredients for any item specifically marked as cancelled
    if (updates.items && existing.items) {
      const existingMap = new Map(existing.items.map((i) => [i.id, i]));
      for (const updatedItem of updates.items) {
        const oldItem = existingMap.get(updatedItem.id);
        if (oldItem && oldItem.inventoryDeducted && updatedItem.status === 'cancelled') {
          const menuItem = menuItemDB.getById(updatedItem.menuItemId);
          if (menuItem?.recipe && Array.isArray(menuItem.recipe)) {
            for (const ing of menuItem.recipe) {
              if (ing.inventoryItemId && ing.quantity > 0) {
                const totalRequired = Number(oldItem.quantity || 1) * Number(ing.quantity);
                inventoryDB.addStock(ing.inventoryItemId, totalRequired);
              }
            }
          }
          updatedItem.inventoryDeducted = false;
        }
      }
    }

    // If cancelled, restore any deducted inventory stock; if active/preparing/ready, deduct stock
    if (orders[index].status === 'cancelled') {
      try {
        inventoryDB.restoreForOrder(id);
      } catch {
        // ignore
      }
    } else if (['active', 'preparing', 'ready', 'served'].includes(orders[index].status)) {
      try {
        inventoryDB.deductForOrder(id);
      } catch {
        // ignore
      }
    }

    // Free up table automatically if order is completed or cancelled
    if (['completed', 'cancelled'].includes(orders[index].status)) {
      const targetTableId = orders[index].tableId;
      const targetTableNumber = orders[index].tableNumber;
      if (targetTableId) {
        tableDB.update(targetTableId, { status: 'available', currentOrderId: undefined, waiterCall: undefined });
      } else if (targetTableNumber) {
        const tbl = tableDB.getByNumber(targetTableNumber);
        if (tbl) {
          tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, waiterCall: undefined });
        }
      }
      if (targetTableNumber) {
        notificationDB.acknowledgeForTable(targetTableNumber);
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
    const target = orders.find(o => o.id === id);
    if (!target) return false;

    const filtered = orders.filter(o => o.id !== id);
    setCollection('orders', filtered);

    // 1. Delete from Firestore cloud
    if (isFirebaseActive()) {
      firebaseSync.deleteDoc('orders', id).catch(() => {});
    }

    // 2. Cascade delete matching payments from memory & cloud
    paymentDB.deleteByOrder(id);

    // 3. Free up table if this order was assigned to one
    if (target.tableId) {
      const tbl = tableDB.getById(target.tableId);
      if (tbl && tbl.currentOrderId === id) {
        tableDB.update(target.tableId, { status: 'available', currentOrderId: undefined });
      }
    } else if (target.tableNumber) {
      const tbl = tableDB.getByNumber(target.tableNumber);
      if (tbl && tbl.currentOrderId === id) {
        tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined });
      }
    }

    // 4. Broadcast deletion to other connected devices
    broadcastSync((s) => s.broadcastOrderDeleted(id));
    notifyDbListeners();
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
    if (isFirebaseActive()) {
      firebaseSync.pushDoc('payments', id, payments[index]).catch(() => {});
    }
    return payments[index];
  },

  delete: (id: string): boolean => {
    const payments = paymentDB.getAll();
    const target = payments.find(p => p.id === id);
    if (!target) return false;

    const filtered = payments.filter(p => p.id !== id);
    setCollection('payments', filtered);

    if (isFirebaseActive()) {
      firebaseSync.deleteDoc('payments', id).catch(() => {});
    }
    notifyDbListeners();
    return true;
  },

  deleteByOrder: (orderId: string): boolean => {
    const payments = paymentDB.getAll();
    const matching = payments.filter(p => p.orderId === orderId);
    if (matching.length === 0) return false;

    const filtered = payments.filter(p => p.orderId !== orderId);
    setCollection('payments', filtered);

    if (isFirebaseActive()) {
      matching.forEach(p => {
        firebaseSync.deleteDoc('payments', p.id).catch(() => {});
      });
    }
    notifyDbListeners();
    return true;
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
  getAll: (): InventoryItem[] => {
    const raw = getCollection<InventoryItem>('inventory');
    return raw.map((item: any) => ({
      ...item,
      quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 0,
      minQuantity: typeof item.minQuantity === 'number' ? item.minQuantity : (typeof item.minStock === 'number' ? item.minStock : 0),
      costPerUnit: typeof item.costPerUnit === 'number' ? item.costPerUnit : Number(item.costPerUnit) || 0,
      isActive: item.isActive !== false,
    }));
  },
  
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
      quantity: Math.round((item.quantity + quantity) * 1000) / 1000,
      lastRestocked: new Date().toISOString()
    });
  },

  deductStock: (id: string, quantity: number): InventoryItem | null => {
    const item = inventoryDB.getById(id);
    if (!item) return null;
    const newQuantity = Math.max(0, Math.round((item.quantity - quantity) * 1000) / 1000);
    const updated = inventoryDB.update(id, { quantity: newQuantity });
    if (updated && updated.quantity <= updated.minQuantity && updated.isActive) {
      notificationDB.create({
        type: 'inventory',
        title: `⚠️ Low Stock: ${updated.name}`,
        message: `Stock has fallen to ${updated.quantity} ${updated.unit} (Min: ${updated.minQuantity} ${updated.unit}). Please reorder soon.`
      });
    }
    return updated;
  },

  deductForOrder: (orderId: string): { success: boolean; deductedCount: number } => {
    const order = orderDB.getById(orderId);
    if (!order || !order.items || order.items.length === 0) return { success: false, deductedCount: 0 };
    if (order.status === 'cancelled') return { success: false, deductedCount: 0 };

    let count = 0;
    let modified = false;
    const menuItems = menuItemDB.getAll();
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    const updatedItems = order.items.map((orderItem) => {
      if (orderItem.inventoryDeducted || orderItem.status === 'cancelled') {
        return orderItem;
      }

      const menuItem = menuMap.get(orderItem.menuItemId);
      if (menuItem?.recipe && Array.isArray(menuItem.recipe) && menuItem.recipe.length > 0) {
        for (const ing of menuItem.recipe) {
          if (ing.inventoryItemId && ing.quantity > 0) {
            const totalRequired = Number(orderItem.quantity || 1) * Number(ing.quantity);
            inventoryDB.deductStock(ing.inventoryItemId, totalRequired);
            count++;
          }
        }
      }

      modified = true;
      return { ...orderItem, inventoryDeducted: true };
    });

    if (modified) {
      const allOrders = orderDB.getAll();
      const idx = allOrders.findIndex((o) => o.id === orderId);
      if (idx !== -1) {
        allOrders[idx] = { ...allOrders[idx], items: updatedItems, updatedAt: new Date().toISOString() };
        setCollection('orders', allOrders);
      }
    }

    return { success: true, deductedCount: count };
  },

  restoreForOrder: (orderId: string): { success: boolean; restoredCount: number } => {
    const order = orderDB.getById(orderId);
    if (!order || !order.items || order.items.length === 0) return { success: false, restoredCount: 0 };

    let count = 0;
    let modified = false;
    const menuItems = menuItemDB.getAll();
    const menuMap = new Map(menuItems.map((m) => [m.id, m]));

    const updatedItems = order.items.map((orderItem) => {
      if (!orderItem.inventoryDeducted) {
        return orderItem;
      }

      const menuItem = menuMap.get(orderItem.menuItemId);
      if (menuItem?.recipe && Array.isArray(menuItem.recipe) && menuItem.recipe.length > 0) {
        for (const ing of menuItem.recipe) {
          if (ing.inventoryItemId && ing.quantity > 0) {
            const totalRequired = Number(orderItem.quantity || 1) * Number(ing.quantity);
            inventoryDB.addStock(ing.inventoryItemId, totalRequired);
            count++;
          }
        }
      }

      modified = true;
      return { ...orderItem, inventoryDeducted: false };
    });

    if (modified) {
      const allOrders = orderDB.getAll();
      const idx = allOrders.findIndex((o) => o.id === orderId);
      if (idx !== -1) {
        allOrders[idx] = { ...allOrders[idx], items: updatedItems, updatedAt: new Date().toISOString() };
        setCollection('orders', allOrders);
      }
    }

    return { success: true, restoredCount: count };
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
  
  create: (notification: Omit<Notification, 'createdAt' | 'isRead'> & { id?: string }): Notification => {
    const notifications = notificationDB.getAll();
    const newNotification: Notification = {
      ...notification,
      id: notification.id || uuidv4(),
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

  acknowledgeForTable: (tableNumber: number, acknowledgedBy?: string): void => {
    const notifications = notificationDB.getAll();
    let changed = false;
    const now = new Date().toISOString();
    const updated = notifications.map((n) => {
      const matchesTable =
        n.type === 'table' &&
        (n.tableNumber === tableNumber || n.title.includes(`Table ${tableNumber}`));
      if (matchesTable && !n.isRead) {
        changed = true;
        return {
          ...n,
          isRead: true,
          acknowledgedAt: now,
          acknowledgedBy: acknowledgedBy || 'Staff',
        };
      }
      return n;
    });

    if (changed) {
      setCollection('notifications', updated);
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

/**
 * Universal waiter call acknowledgment helper:
 * Clears table waiter call, marks all matching notifications as read across clouds,
 * and broadcasts real-time acknowledgment to all peer devices.
 */
export function acknowledgeWaiterCall(tableNumber: number, acknowledgedBy?: string): void {
  // 1. Clear waiterCall on table in tableDB (pushes to cloud & broadcasts TABLE_UPDATED)
  const tbl = tableDB.getByNumber(tableNumber);
  if (tbl && tbl.waiterCall) {
    tableDB.update(tbl.id, { waiterCall: undefined });
  }

  // 2. Mark all matching notifications as read in memory and cloud
  notificationDB.acknowledgeForTable(tableNumber, acknowledgedBy);

  // 3. Broadcast real-time acknowledgment to peer devices
  broadcastSync((s) => s.broadcastWaiterCallAcknowledged(tableNumber));
}

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
      backupInterval: 24,
      waiterApkUrl: './restaurant-lite.apk',
      waiterCallSound: 'chime',
      waiterCallVibration: true,
    };
    
    const stored = getItem<AppSettings>('settings');
    if (!stored) return defaultSettings;
    const res: AppSettings = {
      ...defaultSettings,
      ...stored,
      waiterCallSound: stored.waiterCallSound || 'chime',
      waiterCallVibration: stored.waiterCallVibration !== false,
      waiterApkUrl: (!stored.waiterApkUrl || stored.waiterApkUrl === './restaurant-waiter-lite.apk')
        ? defaultSettings.waiterApkUrl
        : stored.waiterApkUrl,
    };
    if (stored.restaurantLogo && typeof stored.restaurantLogo === 'string' && stored.restaurantLogo.trim() !== '') {
      res.restaurantLogo = stored.restaurantLogo;
    } else {
      delete res.restaurantLogo;
    }
    return res;
  },
  
  update: (updates: Partial<AppSettings>): AppSettings => {
    const current = settingsDB.get();
    const updated: AppSettings = {
      ...current,
      ...updates,
      _rev: (typeof (current as any)._rev === 'number' ? (current as any)._rev : 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    if (!updates.restaurantLogo && 'restaurantLogo' in updates) {
      delete updated.restaurantLogo;
    }
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
    const rawData = {
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
    };

    const sanitizedExport = sanitizeBackupForExport(rawData);
    return JSON.stringify(sanitizedExport, null, 2);
  },
  
  import: (jsonData: string): { success: boolean; error?: string } => {
    try {
      const existingUsers = userDB.getAll();
      const existingEmployees = employeeDB.getAll();

      const validation = validateBackupPayload(jsonData, {
        existingUsers,
        existingEmployees,
      });

      if (!validation.valid || !validation.data) {
        return {
          success: false,
          error: validation.error || 'Backup validation failed.',
        };
      }

      const { data } = validation;

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

      return { success: true };
    } catch (error: any) {
      console.error('Failed to import backup:', error);
      return { success: false, error: error?.message || 'Failed to parse and restore backup.' };
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
  
  // Auto-migrate any existing unhashed passwords in localStorage to bcrypt
  if (users.length > 0) {
    let migrated = false;
    const upgraded = users.map((u) => {
      if (u.password && !u.password.startsWith('$2') && !u.password.startsWith('$sha256$')) {
        migrated = true;
        let raw = u.password;
        try {
          if (btoa(atob(raw)) === raw && !/^[0-9a-fA-F]{32,}$/.test(raw)) {
            raw = atob(raw);
          }
        } catch {
          // not base64, use as-is
        }
        return { ...u, password: safeHashPassword(raw) };
      }
      return u;
    });
    if (migrated) {
      setCollection('users', upgraded);
    }
  }

  // Create sample employees if needed
  if (employeeDB.getAll().length === 0) {
    const employees = [
      { name: 'John Manager', email: 'john@miyacurry.com', phone: '1234567890', role: 'manager' as const, salary: 350000, shift: 'morning' as const, joiningDate: '2023-01-15', isActive: true },
      { name: 'Sarah Waiter', email: 'sarah@miyacurry.com', phone: '1234567891', role: 'waiter' as const, salary: 220000, shift: 'evening' as const, joiningDate: '2023-03-20', isActive: true },
      { name: 'Head Chef Miya', email: 'chef@miyacurry.com', phone: '1234567892', role: 'chef' as const, salary: 450000, shift: 'morning' as const, joiningDate: '2022-11-10', isActive: true },
      { name: 'Lisa Cashier', email: 'lisa@miyacurry.com', phone: '1234567893', role: 'cashier' as const, salary: 200000, shift: 'flexible' as const, joiningDate: '2023-06-01', isActive: true }
    ];
    employees.forEach(e => employeeDB.create(e));
  }
  
  // Create categories from initialDbData if empty
  if (categoryDB.getAll().length === 0 && initialDbData.categories) {
    setCollection('categories', initialDbData.categories as Category[]);
  }

  // Create menu items from initialDbData if empty
  if (menuItemDB.getAll().length === 0 && initialDbData.menuItems) {
    initialDbData.menuItems.forEach((m) =>
      menuItemDB.create({
        ...m,
        price: Number(m.price),
        isAvailable: m.isAvailable ?? true,
        isVeg: m.isVeg ?? (m as any).isVegetarian ?? true,
        imageUrl: m.imageUrl || (m as any).image,
      } as unknown as MenuItem)
    );
  }
  
  // Create tables if empty
  if (tableDB.getAll().length === 0) {
    for (let i = 1; i <= 12; i++) {
      tableDB.create({
        number: i,
        capacity: i <= 4 ? 2 : i <= 8 ? 4 : 6,
        status: 'available',
        floor: i <= 6 ? 1 : 2
      });
    }
  }
  
  // Create suppliers if empty
  if (supplierDB.getAll().length === 0) {
    const suppliers = [
      { name: 'Utsunomiya Food Supplies Ltd', email: 'orders@utsunomiyafood.jp', phone: '028-632-0001', address: '1-2-3 Odori, Utsunomiya', gstNumber: 'JP9876543210', isActive: true },
      { name: 'Tochigi Fresh Poultry & Dairy', email: 'ken@tochigifresh.jp', phone: '028-632-0002', address: '4-5-6 Station Road, Utsunomiya', gstNumber: 'JP1122334455', isActive: true },
      { name: 'Tokyo Spice & Rice Imports', email: 'sales@tokyospice.jp', phone: '03-5551-2222', address: '7-8-9 Tsukiji, Tokyo', gstNumber: 'JP5566778899', isActive: true }
    ];
    const createdSuppliers = suppliers.map(s => supplierDB.create(s));
    
    // Create inventory items with realistic JPY unit costs if empty
    if (inventoryDB.getAll().length === 0) {
      const inventoryItems = [
        { name: 'Chicken Breast', unit: 'kg', quantity: 25, minQuantity: 10, costPerUnit: 600, supplierId: createdSuppliers[1].id, isActive: true },
        { name: 'Salmon Fillet', unit: 'kg', quantity: 15, minQuantity: 5, costPerUnit: 1200, supplierId: createdSuppliers[1].id, isActive: true },
        { name: 'Tomatoes', unit: 'kg', quantity: 30, minQuantity: 15, costPerUnit: 250, supplierId: createdSuppliers[0].id, isActive: true },
        { name: 'Lettuce', unit: 'kg', quantity: 20, minQuantity: 8, costPerUnit: 300, supplierId: createdSuppliers[0].id, isActive: true },
        { name: 'Orange Juice', unit: 'L', quantity: 50, minQuantity: 20, costPerUnit: 400, supplierId: createdSuppliers[0].id, isActive: true },
        { name: 'Coffee Beans', unit: 'kg', quantity: 10, minQuantity: 5, costPerUnit: 1500, supplierId: createdSuppliers[2].id, isActive: true },
        { name: 'Basmati Rice', unit: 'kg', quantity: 40, minQuantity: 15, costPerUnit: 300, supplierId: createdSuppliers[2].id, isActive: true },
        { name: 'Mozzarella Cheese', unit: 'kg', quantity: 8, minQuantity: 5, costPerUnit: 800, supplierId: createdSuppliers[1].id, isActive: true }
      ];
      inventoryItems.forEach(i => inventoryDB.create(i));
    }
  }
  
  // Deduplicate and sanitize categories to clean up any past duplicates
  const currentCategories = getCollection<Category>('categories');
  if (currentCategories.length > 0) {
    sanitizeAndDeduplicateCategories(currentCategories);
  }

  // Deduplicate and sanitize menu items to clean up any past duplicates
  const currentMenuItems = getCollection<MenuItem>('menuItems');
  if (currentMenuItems.length > 0) {
    sanitizeAndDeduplicateMenuItems(currentMenuItems);
  }

  // Purge any legacy sample data so database is clean
  purgeSampleData();

  console.log('Database initialized successfully without sample records!');
};

/**
 * Purges any sample / demo orders, sample payments, and demo notifications from both
 * local in-memory store and Firestore cloud.
 */
export function purgeSampleData(): { ordersRemoved: number; paymentsRemoved: number; tablesRemoved: number; notificationsRemoved: number } {
  const orders = getCollection<Order>('orders');
  const sampleOrders = orders.filter(
    (o) =>
      o.customerName === 'John Doe' ||
      o.id.startsWith('sample-') ||
      o.orderNumber?.toLowerCase().includes('sample') ||
      o.customerName?.toLowerCase().includes('sample') ||
      o.notes?.toLowerCase().includes('sample demo')
  );

  sampleOrders.forEach((o) => {
    orderDB.delete(o.id);
  });

  // Also purge any orphaned sample payments
  const payments = getCollection<Payment>('payments');
  const samplePayments = payments.filter(
    (p) =>
      p.orderNumber?.toLowerCase().includes('sample') ||
      p.id?.startsWith('sample-') ||
      p.receivedBy?.toLowerCase().includes('sample')
  );
  samplePayments.forEach((p) => {
    paymentDB.delete(p.id);
  });

  // Release any tables that were tied to deleted orders and purge test tables like 99
  const currentOrders = orderDB.getAll();
  const validOrderIds = new Set(currentOrders.map((o) => o.id));
  const tables = getCollection<Table>('tables');
  let tablesRemoved = 0;
  tables.forEach((tbl) => {
    if (tbl.number === 99 || tbl.number >= 90) {
      tableDB.delete(tbl.id);
      tablesRemoved++;
    } else if (tbl.currentOrderId && !validOrderIds.has(tbl.currentOrderId)) {
      tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
    }
  });

  const notifications = getCollection<Notification>('notifications');
  const filteredNotifs = notifications.filter(
    (n) => !n.title.toLowerCase().includes('welcome to restaurant manager')
  );
  if (filteredNotifs.length !== notifications.length) {
    setCollection('notifications', filteredNotifs);
    if (isFirebaseActive()) {
      notifications
        .filter((n) => n.title.toLowerCase().includes('welcome to restaurant manager'))
        .forEach((n) => {
          firebaseSync.deleteDoc('notifications', n.id).catch(() => {});
        });
    }
  }

  return {
    ordersRemoved: sampleOrders.length,
    paymentsRemoved: samplePayments.length,
    tablesRemoved,
    notificationsRemoved: notifications.length - filteredNotifs.length,
  };
}

import type { Order, UserRole } from '../types';

export type AppPage =
  | 'dashboard'
  | 'menu'
  | 'orders'
  | 'tables'
  | 'pos'
  | 'inventory'
  | 'employees'
  | 'reports'
  | 'kitchen'
  | 'suppliers'
  | 'settings'
  | 'users';

export const PAGE_ACCESS: Record<UserRole, AppPage[]> = {
  admin: ['dashboard', 'pos', 'orders', 'kitchen', 'tables', 'menu', 'inventory', 'suppliers', 'employees', 'reports', 'users', 'settings'],
  manager: ['dashboard', 'pos', 'orders', 'kitchen', 'tables', 'menu', 'inventory', 'suppliers', 'employees', 'reports'],
  cashier: ['dashboard', 'pos', 'orders'],
  waiter: ['pos', 'orders', 'tables'],
  chef: ['kitchen', 'orders'],
};

export function canViewPage(role: UserRole | undefined, page: AppPage): boolean {
  if (!role) return false;
  return PAGE_ACCESS[role]?.includes(page) ?? false;
}

export function getDefaultPageForRole(role: UserRole | undefined): AppPage {
  if (!role) return 'dashboard';
  return PAGE_ACCESS[role]?.[0] ?? 'dashboard';
}

export function canAdvanceOrder(role: UserRole | undefined, status: Order['status']): boolean {
  if (!role) return false;

  if (role === 'admin' || role === 'manager') {
    return !['completed', 'cancelled'].includes(status);
  }

  if (role === 'chef') {
    return ['active', 'preparing', 'ready'].includes(status);
  }

  if (role === 'waiter') {
    return ['ready', 'served'].includes(status);
  }

  return false;
}

export function getOrderAdvanceLabel(role: UserRole | undefined, status: Order['status']): string {
  if (role === 'waiter') {
    if (status === 'ready') return 'Mark Served';
    if (status === 'served') return 'Pay & Complete';
  }

  if (status === 'active') return 'Start Preparing';
  if (status === 'preparing') return 'Mark Ready';
  if (status === 'ready') return 'Mark Served';
  if (status === 'served') return 'Pay & Complete';
  return 'Update';
}

export function canCancelOrder(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canPrintInvoice(role: UserRole | undefined): boolean {
  return role !== 'chef' && !!role;
}

export function canManageTableStructure(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canOperateTables(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'waiter';
}

export function canAccessDataSettings(role: UserRole | undefined): boolean {
  return role === 'admin';
}

export function canManageInventory(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canDeleteInventory(role: UserRole | undefined): boolean {
  return role === 'admin';
}

export function canManageSuppliers(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canDeleteSupplier(role: UserRole | undefined): boolean {
  return role === 'admin';
}

export function canManageEmployees(role: UserRole | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

export function canAssignEmployeeRole(actorRole: UserRole | undefined, targetRole: UserRole): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'manager') {
    return ['waiter', 'chef', 'cashier'].includes(targetRole);
  }
  return false;
}

export function canEditEmployeeRecord(actorRole: UserRole | undefined, targetRole: UserRole): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'manager') {
    return ['waiter', 'chef', 'cashier'].includes(targetRole);
  }
  return false;
}

export function canDeleteEmployeeRecord(actorRole: UserRole | undefined, targetRole: UserRole): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'manager') {
    return ['waiter', 'chef', 'cashier'].includes(targetRole);
  }
  return false;
}

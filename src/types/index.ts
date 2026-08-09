// Core Types for Restaurant Management System

export type UserRole = 'admin' | 'manager' | 'waiter' | 'chef' | 'cashier';

export interface User {
  id: string;
  username: string;
  password: string; // hashed
  role: UserRole;
  employeeId?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  salary: number;
  shift: 'morning' | 'evening' | 'night' | 'flexible';
  joiningDate: string;
  isActive: boolean;
  address?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  cost: number;
  imageUrl?: string;
  barcode?: string;
  isAvailable: boolean;
  isVeg: boolean;
  preparationTime: number; // in minutes
  ingredients: string[];
  createdAt: string;
}

export interface Table {
  id: string;
  number: number;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  floor?: number;
  qrCode?: string;
  positionX?: number;
  positionY?: number;
  currentOrderId?: string;
  reservationInfo?: {
    customerName: string;
    customerPhone: string;
    reservationTime: string;
    partySize: number;
  };
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
}

export interface Order {
  id: string;
  orderNumber: string;
  tableId?: string;
  tableNumber?: number;
  type: 'dine-in' | 'takeaway' | 'delivery';
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  total: number;
  status: 'active' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  customerName?: string;
  customerPhone?: string;
  waiterId?: string;
  waiterName?: string;
  createdAt: string;
  completedAt?: string;
  notes?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  method: 'cash' | 'card' | 'upi' | 'other';
  status: 'pending' | 'completed' | 'refunded';
  transactionId?: string;
  receivedBy: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  gstNumber?: string;
  isActive: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  costPerUnit: number;
  supplierId?: string;
  lastRestocked?: string;
  isActive: boolean;
}

export interface PurchaseEntry {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  purchaseDate: string;
  notes?: string;
}

export interface DailySales {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  dineInOrders: number;
  takeawayOrders: number;
  cashPayments: number;
  cardPayments: number;
  upiPayments: number;
}

export interface Notification {
  id: string;
  type: 'order' | 'inventory' | 'system' | 'alert';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type ThemeMode = 'light' | 'dark';

export interface AppSettings {
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  gstNumber: string;
  taxPercentage: number;
  currency: string;
  currencySymbol: string;
  theme: ThemeMode;
  language: 'en' | 'es' | 'fr' | 'hi';
  autoBackup: boolean;
  backupInterval: number; // in hours
}

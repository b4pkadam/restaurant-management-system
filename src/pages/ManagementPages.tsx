import { useEffect, useMemo, useState } from 'react';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency, SUPPORTED_CURRENCIES } from '../utils/formatCurrency';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChefHat,
  Download,
  Edit,
  Eye,
  EyeOff,
  FileDown,
  PackagePlus,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
  Upload,
  UserCog,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Table as DataTable } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { QRCodeModal } from '../components/QRCodeModal';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  analyticsDB,
  backupDB,
  categoryDB,
  employeeDB,
  inventoryDB,
  menuItemDB,
  orderDB,
  paymentDB,
  purchaseDB,
  settingsDB,
  supplierDB,
  tableDB,
  userDB,
} from '../database/db';
import type {
  AppSettings,
  Category,
  Employee,
  InventoryItem,
  MenuItem,
  Order,
  OrderItem,
  PurchaseEntry,
  Supplier,
  Table,
  User,
  UserRole,
} from '../types';
import { cn } from '../utils/cn';
import {
  canAdvanceOrder,
  canAssignEmployeeRole,
  canCancelOrder,
  canDeleteEmployeeRecord,
  canDeleteInventory,
  canDeleteSupplier,
  canEditEmployeeRecord,
  canManageEmployees,
  canManageInventory,
  canManageSuppliers,
  canManageTableStructure,
  canOperateTables,
  canPrintInvoice,
  getOrderAdvanceLabel,
} from '../utils/access';

const COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6'];

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'chef', label: 'Chef' },
  { value: 'cashier', label: 'Cashier' },
];

const shiftOptions = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
  { value: 'flexible', label: 'Flexible' },
];

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function currency(value: number, symbol?: string) {
  return formatCurrency(value, symbol);
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function printInvoice(order: Order) {
  const settings = settingsDB.get();
  const payment = paymentDB.getByOrder(order.id);
  const invoiceWindow = window.open('', '_blank', 'width=900,height=700');
  if (!invoiceWindow) return;

  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${item.menuItemName}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${currency(item.unitPrice, settings.currencySymbol)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${currency(item.totalPrice, settings.currencySymbol)}</td>
        </tr>
      `,
    )
    .join('');

  invoiceWindow.document.write(`
    <html>
      <head>
        <title>Invoice ${order.orderNumber}</title>
      </head>
      <body style="font-family:Arial, sans-serif;padding:24px;color:#111827;">
        <div style="max-width:800px;margin:0 auto;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
            <div>
              <h1 style="margin:0;font-size:28px;">${settings.restaurantName}</h1>
              <p style="margin:8px 0 0;color:#6b7280;">${settings.restaurantAddress}</p>
              <p style="margin:4px 0 0;color:#6b7280;">Phone: ${settings.restaurantPhone}</p>
              <p style="margin:4px 0 0;color:#6b7280;">GST: ${settings.gstNumber}</p>
            </div>
            <div style="text-align:right;">
              <h2 style="margin:0;">Invoice</h2>
              <p style="margin:8px 0 0;color:#6b7280;">Order: ${order.orderNumber}</p>
              <p style="margin:4px 0 0;color:#6b7280;">Date: ${format(new Date(order.createdAt), 'PPP p')}</p>
              <p style="margin:4px 0 0;color:#6b7280;">Payment: ${payment?.method?.toUpperCase() || 'N/A'}</p>
            </div>
          </div>

          <div style="margin-bottom:20px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:#f9fafb;padding:12px;border-radius:12px;">
              <strong>Customer</strong>
              <p style="margin:6px 0 0;">${order.customerName || 'Walk-in Customer'}</p>
              <p style="margin:4px 0 0;color:#6b7280;">${order.customerPhone || '—'}</p>
            </div>
            <div style="background:#f9fafb;padding:12px;border-radius:12px;">
              <strong>Order Details</strong>
              <p style="margin:6px 0 0;">Type: ${order.type}</p>
              <p style="margin:4px 0 0;">Table: ${order.tableNumber || 'Takeaway'}</p>
              <p style="margin:4px 0 0;">Status: ${order.status}</p>
            </div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead>
              <tr style="background:#eff6ff;">
                <th style="padding:10px;text-align:left;">Item</th>
                <th style="padding:10px;text-align:center;">Qty</th>
                <th style="padding:10px;text-align:right;">Rate</th>
                <th style="padding:10px;text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div style="margin-left:auto;max-width:320px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;">
              <span>Subtotal</span>
              <strong>${currency(order.subtotal, settings.currencySymbol)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;">
              <span>Discount</span>
              <strong>${currency(order.discount, settings.currencySymbol)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;">
              <span>Tax</span>
              <strong>${currency(order.tax, settings.currencySymbol)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827;font-size:20px;">
              <span>Total</span>
              <strong>${currency(order.total, settings.currencySymbol)}</strong>
            </div>
          </div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  invoiceWindow.document.close();
}

export function MenuManagementPage() {
  const { success, error } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    price: '0',
    cost: '0',
    imageUrl: '',
    barcode: '',
    isAvailable: true,
    isVeg: true,
    allowsSpiceLevel: true,
    includesDrink: false,
    preparationTime: '10',
    ingredients: '',
  });
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: '🍽️',
    sortOrder: '1',
    isActive: true,
  });

  const loadData = () => {
    const allCategories = categoryDB.getAll().sort((a, b) => a.sortOrder - b.sortOrder);
    setCategories(allCategories);
    setItems(menuItemDB.getAll());
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = `${item.name} ${item.description || ''} ${item.barcode || ''}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, search, categoryFilter]);

  const resetItemForm = () => {
    setEditingItem(null);
    setItemForm({
      name: '',
      description: '',
      categoryId: categories[0]?.id || '',
      price: '0',
      cost: '0',
      imageUrl: '',
      barcode: '',
      isAvailable: true,
      isVeg: true,
      allowsSpiceLevel: true,
      includesDrink: false,
      preparationTime: '10',
      ingredients: '',
    });
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      description: '',
      icon: '🍽️',
      sortOrder: String(categories.length + 1),
      isActive: true,
    });
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || '',
      categoryId: item.categoryId,
      price: String(item.price),
      cost: String(item.cost),
      imageUrl: item.imageUrl || '',
      barcode: item.barcode || '',
      isAvailable: item.isAvailable,
      isVeg: item.isVeg,
      allowsSpiceLevel: item.allowsSpiceLevel ?? true,
      includesDrink: item.includesDrink ?? false,
      preparationTime: String(item.preparationTime),
      ingredients: item.ingredients ? item.ingredients.join(', ') : '',
    });
    setShowItemModal(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '🍽️',
      sortOrder: String(category.sortOrder),
      isActive: category.isActive,
    });
    setShowCategoryModal(true);
  };

  const saveItem = () => {
    if (!itemForm.name.trim() || !itemForm.categoryId) {
      error('Please enter item name and category.');
      return;
    }

    const payload = {
      name: itemForm.name.trim(),
      description: itemForm.description.trim(),
      categoryId: itemForm.categoryId,
      price: Number(itemForm.price),
      cost: Number(itemForm.cost),
      imageUrl: itemForm.imageUrl.trim() || undefined,
      barcode: itemForm.barcode.trim() || undefined,
      isAvailable: itemForm.isAvailable,
      isVeg: itemForm.isVeg,
      allowsSpiceLevel: itemForm.allowsSpiceLevel,
      includesDrink: itemForm.includesDrink,
      preparationTime: Number(itemForm.preparationTime) || 0,
      ingredients: itemForm.ingredients
        .split(',')
        .map((ingredient) => ingredient.trim())
        .filter(Boolean),
    };

    if (editingItem) {
      menuItemDB.update(editingItem.id, payload);
      success('Menu item updated successfully.');
    } else {
      menuItemDB.create(payload);
      success('Menu item created successfully.');
    }

    setShowItemModal(false);
    resetItemForm();
    loadData();
  };

  const saveCategory = () => {
    if (!categoryForm.name.trim()) {
      error('Please enter category name.');
      return;
    }

    const payload = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim(),
      icon: categoryForm.icon.trim() || '🍽️',
      sortOrder: Number(categoryForm.sortOrder) || categories.length + 1,
      isActive: categoryForm.isActive,
    };

    if (editingCategory) {
      categoryDB.update(editingCategory.id, payload);
      success('Category updated successfully.');
    } else {
      categoryDB.create(payload);
      success('Category created successfully.');
    }

    setShowCategoryModal(false);
    resetCategoryForm();
    loadData();
  };

  const deleteItem = (id: string) => {
    if (!window.confirm('Delete this menu item?')) return;
    menuItemDB.delete(id);
    loadData();
    success('Menu item deleted.');
  };

  const deleteCategory = (id: string) => {
    const itemCount = items.filter((item) => item.categoryId === id).length;
    if (itemCount > 0) {
      error('This category contains menu items. Move or remove them first.');
      return;
    }
    if (!window.confirm('Delete this category?')) return;
    categoryDB.delete(id);
    loadData();
    success('Category deleted.');
  };

  const categoryCards = categories.map((category) => ({
    ...category,
    itemCount: items.filter((item) => item.categoryId === category.id).length,
  }));

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Menu Management"
        description="Manage categories, menu items, prices, images, barcodes, and availability."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }} leftIcon={<Plus size={16} />}>
              Add Category
            </Button>
            <Button onClick={() => { resetItemForm(); setShowItemModal(true); }} leftIcon={<Plus size={16} />}>
              Add Menu Item
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Active Categories" value={categories.filter((c) => c.isActive).length} icon={<UtensilsCrossed size={22} />} color="blue" />
        <StatCard title="Menu Items" value={items.length} icon={<Receipt size={22} />} color="green" />
        <StatCard title="Unavailable Items" value={items.filter((i) => !i.isAvailable).length} icon={<EyeOff size={22} />} color="yellow" />
      </div>

      <Tabs
        variant="underline"
        tabs={[
          {
            id: 'items',
            label: 'Menu Items',
            content: (
              <div className="space-y-4">
                <Card>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input placeholder="Search by name, description, or barcode" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={16} />} />
                    <Select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      options={[
                        { value: 'all', label: 'All Categories' },
                        ...categories.map((category) => ({ value: category.id, label: category.name })),
                      ]}
                    />
                    <div className="flex items-center justify-end text-sm text-gray-500 dark:text-gray-400">
                      Showing {filteredItems.length} item(s)
                    </div>
                  </div>
                </Card>
                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'Item',
                      render: (item) => (
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.description || 'No description'}</p>
                        </div>
                      ),
                    },
                    {
                      key: 'categoryId',
                      header: 'Category',
                      render: (item) => categories.find((category) => category.id === item.categoryId)?.name || 'Unknown',
                    },
                    {
                      key: 'barcode',
                      header: 'Barcode',
                      render: (item) => item.barcode || '—',
                    },
                    {
                      key: 'price',
                      header: 'Price',
                      render: (item) => currency(item.price),
                    },
                    {
                      key: 'isAvailable',
                      header: 'Status',
                      render: (item) => (
                        <div className="flex items-center gap-2">
                          <Badge variant={item.isVeg ? 'success' : 'danger'}>{item.isVeg ? 'Veg' : 'Non-Veg'}</Badge>
                          <Badge variant={item.isAvailable ? 'success' : 'warning'}>{item.isAvailable ? 'Available' : 'Hidden'}</Badge>
                        </div>
                      ),
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (item) => (
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEditItem(item)} leftIcon={<Edit size={14} />}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              menuItemDB.update(item.id, { isAvailable: !item.isAvailable });
                              loadData();
                              success(`Item ${item.isAvailable ? 'hidden' : 'enabled'} successfully.`);
                            }}
                            leftIcon={item.isAvailable ? <EyeOff size={14} /> : <Eye size={14} />}
                          >
                            {item.isAvailable ? 'Hide' : 'Show'}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deleteItem(item.id)} leftIcon={<Trash2 size={14} />}>
                            Delete
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  data={filteredItems}
                  keyExtractor={(item) => item.id}
                  emptyMessage="No menu items found"
                />
              </div>
            ),
          },
          {
            id: 'categories',
            label: 'Categories',
            content: (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {categoryCards.map((category) => (
                  <Card key={category.id} className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-2xl dark:bg-blue-900/30">
                          {category.icon || '🍽️'}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{category.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{category.itemCount} item(s)</p>
                        </div>
                      </div>
                      <Badge variant={category.isActive ? 'success' : 'warning'}>{category.isActive ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{category.description || 'No description added.'}</p>
                    <div className="flex gap-2">
                      <Button className="flex-1" variant="outline" onClick={() => openEditCategory(category)} leftIcon={<Edit size={14} />}>
                        Edit
                      </Button>
                      <Button className="flex-1" variant="danger" onClick={() => deleteCategory(category.id)} leftIcon={<Trash2 size={14} />}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ),
          },
        ]}
      />

      <Modal isOpen={showItemModal} onClose={() => setShowItemModal(false)} title={editingItem ? 'Edit Menu Item' : 'Add Menu Item'} size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Item Name" value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Select
              label="Category"
              value={itemForm.categoryId}
              onChange={(e) => setItemForm((prev) => ({ ...prev, categoryId: e.target.value }))}
              options={categories.map((category) => ({ value: category.id, label: `${category.icon || '🍽️'} ${category.name}` }))}
            />
            <Input label="Selling Price" type="number" value={itemForm.price} onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))} />
            <Input label="Cost Price" type="number" value={itemForm.cost} onChange={(e) => setItemForm((prev) => ({ ...prev, cost: e.target.value }))} />
            <Input label="Barcode" value={itemForm.barcode} onChange={(e) => setItemForm((prev) => ({ ...prev, barcode: e.target.value }))} />
            <Input label="Preparation Time (mins)" type="number" value={itemForm.preparationTime} onChange={(e) => setItemForm((prev) => ({ ...prev, preparationTime: e.target.value }))} />
          </div>
          <Input label="Image URL" value={itemForm.imageUrl} onChange={(e) => setItemForm((prev) => ({ ...prev, imageUrl: e.target.value }))} />
          <Textarea label="Description" value={itemForm.description} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
          <Textarea label="Ingredients (comma separated)" value={itemForm.ingredients} onChange={(e) => setItemForm((prev) => ({ ...prev, ingredients: e.target.value }))} rows={3} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <input type="checkbox" checked={itemForm.isVeg} onChange={(e) => setItemForm((prev) => ({ ...prev, isVeg: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Vegetarian item</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <input type="checkbox" checked={itemForm.isAvailable} onChange={(e) => setItemForm((prev) => ({ ...prev, isAvailable: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Available for sale</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <input type="checkbox" checked={itemForm.allowsSpiceLevel} onChange={(e) => setItemForm((prev) => ({ ...prev, allowsSpiceLevel: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable 5-Stage Spice Choice</span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <input type="checkbox" checked={itemForm.includesDrink} onChange={(e) => setItemForm((prev) => ({ ...prev, includesDrink: e.target.checked }))} />
              <span className="text-sm text-gray-700 dark:text-gray-300">Enable Drink Selection</span>
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowItemModal(false)}>Cancel</Button>
            <Button onClick={saveItem} leftIcon={<Save size={16} />}>Save Item</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title={editingCategory ? 'Edit Category' : 'Add Category'} size="md">
        <div className="space-y-4">
          <Input label="Category Name" value={categoryForm.name} onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Icon / Emoji" value={categoryForm.icon} onChange={(e) => setCategoryForm((prev) => ({ ...prev, icon: e.target.value }))} />
            <Input label="Sort Order" type="number" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm((prev) => ({ ...prev, sortOrder: e.target.value }))} />
          </div>
          <Textarea label="Description" value={categoryForm.description} onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Category is active</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
            <Button onClick={saveCategory} leftIcon={<Save size={16} />}>Save Category</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function OrdersManagementPage() {
  useDbUpdate();
  const { success } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadOrders = () => {
    setOrders(orderDB.getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = `${order.orderNumber} ${order.customerName || ''} ${order.waiterName || ''}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const activeOrders = orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
  const completedOrders = orders.filter((order) => order.status === 'completed');

  const advanceOrder = (order: Order) => {
    if (!canAdvanceOrder(user?.role, order.status)) return;

    if (order.status === 'active') {
      orderDB.update(order.id, {
        status: 'preparing',
        items: order.items.map((item) => ({ ...item, status: 'preparing' })),
      });
      addNotification('order', 'Kitchen Started', `${order.orderNumber} is now preparing.`);
      success(`${order.orderNumber} moved to preparing.`);
    } else if (order.status === 'preparing') {
      orderDB.update(order.id, {
        status: 'ready',
        items: order.items.map((item) => ({ ...item, status: 'ready' })),
      });
      addNotification('order', 'Order Ready', `${order.orderNumber} is ready to serve.`);
      success(`${order.orderNumber} is ready.`);
    } else if (order.status === 'ready' && ['admin', 'manager', 'waiter', 'chef'].includes(user?.role || '')) {
      orderDB.update(order.id, {
        status: 'served',
        items: order.items.map((item) => ({ ...item, status: 'served' })),
      });
      success(`${order.orderNumber} marked as served.`);
    } else if (order.status === 'served' && ['admin', 'manager', 'waiter'].includes(user?.role || '')) {
      orderDB.complete(order.id);
      addNotification('order', 'Order Completed', `${order.orderNumber} has been completed.`);
      success(`${order.orderNumber} completed successfully.`);
    }
    loadOrders();
  };

  const cancelOrder = (order: Order) => {
    if (!window.confirm(`Cancel ${order.orderNumber}?`)) return;
    orderDB.update(order.id, { status: 'cancelled' });
    if (order.tableId) {
      tableDB.update(order.tableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
    }
    addNotification('alert', 'Order Cancelled', `${order.orderNumber} has been cancelled.`);
    loadOrders();
    success(`${order.orderNumber} cancelled.`);
  };

  const renderOrders = (list: Order[]) => (
    <div className="space-y-4">
      {list.length === 0 ? (
        <Card className="py-10 text-center text-gray-500 dark:text-gray-400">No orders found.</Card>
      ) : (
        list.map((order) => (
          <Card key={order.id} className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{order.orderNumber}</h3>
                  <StatusBadge status={order.status} />
                  <Badge variant={order.type === 'dine-in' ? 'primary' : 'success'}>{order.type}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-gray-500 dark:text-gray-400 md:grid-cols-2">
                  <p>Customer: {order.customerName || 'Walk-in customer'}</p>
                  <p>Table: {order.tableNumber || 'Takeaway'}</p>
                  <p>Created: {format(new Date(order.createdAt), 'PPP p')}</p>
                  <p>Waiter: {order.waiterName || '—'}</p>
                </div>
              </div>
              <div className="text-left lg:text-right">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{currency(order.total)}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{order.items.length} item(s)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {order.items.map((item) => (
                <div key={item.id} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{item.menuItemName}</p>
                      {(() => {
                        const nameLower = item.menuItemName.toLowerCase();
                        const isBev = nameLower.includes('lassi') || nameLower.includes('chai') || nameLower.includes('beer') || nameLower.includes('juice') || nameLower.includes('soda') || nameLower.includes('tea') || nameLower.includes('water');
                        const isSet = nameLower.includes('set') || nameLower.includes('セット') || nameLower.includes('thali') || nameLower.includes('combo') || nameLower.includes('maharaja') || nameLower.includes('special');

                        const displaySpice = item.spiceLevel || (!isBev ? '2 - Medium (中辛)' : undefined);
                        const displayDrink = item.selectedDrink || (isSet ? 'Mango Lassi (マンゴーラッシー)' : undefined);
                        const displayNotes = item.notes;

                        if (!displaySpice && !displayDrink && !displayNotes) return null;

                        return (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                              {displaySpice && (
                                <span className="rounded-md bg-rose-600 px-2 py-0.5 font-bold text-white shadow-xs">
                                  🌶️ {displaySpice}
                                </span>
                              )}
                              {displayDrink && (
                                <span className="rounded-md bg-blue-600 px-2 py-0.5 font-bold text-white shadow-xs">
                                  🥤 {displayDrink}
                                </span>
                              )}
                            </div>
                            {displayNotes && (
                              <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                📝 Note: {displayNotes}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.quantity} × {currency(item.unitPrice)}
                      </p>
                    </div>
                    <StatusBadge status={item.status} showDot={false} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {canAdvanceOrder(user?.role, order.status) && (
                <Button onClick={() => advanceOrder(order)} leftIcon={<CheckCircle2 size={16} />}>
                  {getOrderAdvanceLabel(user?.role, order.status)}
                </Button>
              )}
              {canPrintInvoice(user?.role) && (
                <Button variant="outline" onClick={() => printInvoice(order)} leftIcon={<Printer size={16} />}>
                  Print Invoice
                </Button>
              )}
              {canCancelOrder(user?.role) && !['completed', 'cancelled'].includes(order.status) && (
                <Button variant="danger" onClick={() => cancelOrder(order)} leftIcon={<Trash2 size={16} />}>
                  Cancel Order
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Order Management"
        description="Track all active, ready, served, and completed orders in one place."
        action={
          <Button variant="outline" onClick={loadOrders} leftIcon={<RefreshCw size={16} />}>
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Active Orders" value={activeOrders.length} icon={<Receipt size={22} />} color="yellow" />
        <StatCard title="Completed Orders" value={completedOrders.length} icon={<CheckCircle2 size={22} />} color="green" />
        <StatCard title="Revenue" value={currency(completedOrders.reduce((sum, order) => sum + order.total, 0))} icon={<Receipt size={22} />} color="blue" />
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Search by order number, customer, waiter" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={16} />} />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'preparing', label: 'Preparing' },
              { value: 'ready', label: 'Ready' },
              { value: 'served', label: 'Served' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <div className="flex items-center justify-end text-sm text-gray-500 dark:text-gray-400">
            {filteredOrders.length} order(s)
          </div>
        </div>
      </Card>

      <Tabs
        variant="underline"
        tabs={[
          { id: 'active', label: 'Active Orders', badge: activeOrders.length, content: renderOrders(filteredOrders.filter((order) => !['completed', 'cancelled'].includes(order.status))) },
          { id: 'history', label: 'Order History', badge: completedOrders.length, content: renderOrders(filteredOrders.filter((order) => ['completed', 'cancelled'].includes(order.status))) },
        ]}
      />
    </div>
  );
}

export function KitchenDisplayPage() {
  useDbUpdate();
  const { success } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  const refresh = () => {
    const activeKitchenOrders = orderDB
      .getActive()
      .filter((order) => ['active', 'preparing', 'ready'].includes(order.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setOrders(activeKitchenOrders);
  };

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const updateItemStatus = (order: Order, itemId: string, nextStatus: OrderItem['status']) => {
    const updatedItems = order.items.map((item) => {
      if (item.id === itemId) {
        return { ...item, status: nextStatus };
      }
      return item;
    });

    const nonCancelled = updatedItems.filter((i) => i.status !== 'cancelled');
    let computedOrderStatus: Order['status'] = order.status;

    const allServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served');
    const allReadyOrServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'ready' || i.status === 'served');
    const anyPreparingOrReady = nonCancelled.some((i) => i.status === 'preparing' || i.status === 'ready' || i.status === 'served');

    if (allServed) {
      computedOrderStatus = 'served';
    } else if (allReadyOrServed) {
      computedOrderStatus = 'ready';
    } else if (anyPreparingOrReady) {
      computedOrderStatus = 'preparing';
    } else {
      computedOrderStatus = 'active';
    }

    orderDB.update(order.id, { items: updatedItems, status: computedOrderStatus });

    const targetItem = order.items.find((i) => i.id === itemId);
    const itemName = targetItem?.menuItemName || 'Item';

    if (nextStatus === 'preparing') {
      addNotification('order', 'Item Prep Started', `${itemName} (${order.orderNumber}) is now being prepared.`);
      success(`${itemName} marked as preparing.`);
    } else if (nextStatus === 'ready') {
      addNotification('order', 'Item Ready', `${itemName} (${order.orderNumber}) is ready!`);
      success(`${itemName} is ready!`);
    } else if (nextStatus === 'served') {
      success(`${itemName} marked as served.`);
    }

    refresh();
  };

  const updateStatus = (order: Order) => {
    if (order.status === 'active') {
      orderDB.update(order.id, { status: 'preparing', items: order.items.map((item) => ({ ...item, status: 'preparing' })) });
      addNotification('order', 'Cooking Started', `${order.orderNumber} has started in kitchen.`);
      success(`${order.orderNumber} is now preparing.`);
    } else if (order.status === 'preparing') {
      orderDB.update(order.id, { status: 'ready', items: order.items.map((item) => ({ ...item, status: 'ready' })) });
      addNotification('order', 'Food Ready', `${order.orderNumber} is ready for pickup/serving.`);
      success(`${order.orderNumber} is ready.`);
    } else if (order.status === 'ready') {
      orderDB.update(order.id, { status: 'served', items: order.items.map((item) => ({ ...item, status: 'served' })) });
      addNotification('order', 'Order Served', `${order.orderNumber} has been marked served from the kitchen board.`);
      success(`${order.orderNumber} marked as served.`);
    } else {
      return;
    }
    refresh();
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Kitchen Display System"
        description="Real-time kitchen board for chefs to prepare items and dispatch orders."
        action={
          <Button variant="outline" onClick={refresh} leftIcon={<RefreshCw size={16} />}>
            Refresh Board
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Queued" value={orders.filter((order) => order.status === 'active').length} icon={<Receipt size={22} />} color="yellow" />
        <StatCard title="Preparing" value={orders.filter((order) => order.status === 'preparing').length} icon={<ChefHat size={22} />} color="blue" />
        <StatCard title="Ready" value={orders.filter((order) => order.status === 'ready').length} icon={<CheckCircle2 size={22} />} color="green" />
      </div>

      {orders.length === 0 ? (
        <Card className="py-16 text-center text-gray-500 dark:text-gray-400">
          No kitchen orders waiting right now.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const minutesWaiting = Math.max(1, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));
            return (
              <Card key={order.id} className={cn('space-y-4 border-l-4', order.status === 'active' && 'border-l-yellow-500', order.status === 'preparing' && 'border-l-blue-500', order.status === 'ready' && 'border-l-green-500')}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{order.orderNumber}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Table {order.tableNumber || 'Takeaway'} • {order.type}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{minutesWaiting} min waiting</p>
                  </div>
                </div>
                {order.notes && (
                  <div className="rounded-xl bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 p-2.5 text-xs font-black text-amber-950 dark:text-amber-200">
                    🚨 ORDER INSTRUCTION: {order.notes}
                  </div>
                )}
                <div className="space-y-2">
                  {order.items.map((item) => {
                    const itemStatus = item.status || 'pending';
                    const nameLower = item.menuItemName.toLowerCase();
                    const isBev = nameLower.includes('lassi') || nameLower.includes('chai') || nameLower.includes('beer') || nameLower.includes('juice') || nameLower.includes('soda') || nameLower.includes('tea') || nameLower.includes('water');
                    const isSet = nameLower.includes('set') || nameLower.includes('セット') || nameLower.includes('thali') || nameLower.includes('combo') || nameLower.includes('maharaja') || nameLower.includes('special');

                    const displaySpice = item.spiceLevel || (!isBev ? '2 - Medium (中辛)' : undefined);
                    const displayDrink = item.selectedDrink || (isSet ? 'Mango Lassi (マンゴーラッシー)' : undefined);
                    const displayNotes = item.notes;

                    return (
                      <div key={item.id} className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-900 dark:text-white text-sm">{item.menuItemName}</p>
                            <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
                              x{item.quantity}
                            </span>
                          </div>
                          {(displaySpice || displayDrink || displayNotes) && (
                            <div className="mt-2 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {displaySpice && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                                    🌶️ SPICE: {displaySpice}
                                  </span>
                                )}
                                {displayDrink && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-black text-white shadow-sm">
                                    🥤 DRINK: {displayDrink}
                                  </span>
                                )}
                              </div>
                              {displayNotes && (
                                <div className="rounded-lg bg-amber-100 p-2 text-xs font-extrabold text-amber-950 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800">
                                  📝 Item Note: {displayNotes}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={itemStatus}
                            onChange={(e) => updateItemStatus(order, item.id, e.target.value as OrderItem['status'])}
                            className={cn(
                              'rounded-lg border px-2 py-1 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2',
                              ((itemStatus as string) === 'pending' || (itemStatus as string) === 'active') && 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                              itemStatus === 'preparing' && 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                              itemStatus === 'ready' && 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
                              itemStatus === 'served' && 'border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
                              itemStatus === 'cancelled' && 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                            )}
                          >
                            <option value="pending">Pending</option>
                            <option value="preparing">Preparing</option>
                            <option value="ready">Ready</option>
                            <option value="served">Served</option>
                          </select>

                          {itemStatus === 'preparing' ? (
                            <button
                              type="button"
                              onClick={() => updateItemStatus(order, item.id, 'ready')}
                              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 active:scale-95 transition-all"
                              title="Mark item ready"
                            >
                              <CheckCircle2 size={13} />
                              Ready
                            </button>
                          ) : ((itemStatus as string) === 'pending' || (itemStatus as string) === 'active') ? (
                            <button
                              type="button"
                              onClick={() => updateItemStatus(order, item.id, 'preparing')}
                              className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 active:scale-95 transition-all"
                              title="Start preparing item"
                            >
                              <ChefHat size={13} />
                              Prep
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {canAdvanceOrder(user?.role, order.status) && (
                  <Button className="w-full" onClick={() => updateStatus(order)} leftIcon={<ChefHat size={16} />}>
                    {getOrderAdvanceLabel(user?.role, order.status)}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TableManagementPage() {
  useDbUpdate();
  const { success, error } = useToast();
  const { user } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrTableNumber, setQrTableNumber] = useState(0);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tableForm, setTableForm] = useState({ number: '', capacity: '4', floor: '1' });
  const [reservationForm, setReservationForm] = useState({ customerName: '', customerPhone: '', reservationTime: '', partySize: '2' });

  const loadTables = () => {
    setTables(tableDB.getAll().sort((a, b) => a.number - b.number));
  };

  useEffect(() => {
    loadTables();
  }, []);

  const openTableModal = (table?: Table) => {
    if (table) {
      setEditingTable(table);
      setTableForm({ number: String(table.number), capacity: String(table.capacity), floor: String(table.floor) });
    } else {
      setEditingTable(null);
      setTableForm({ number: String((tables[tables.length - 1]?.number || 0) + 1), capacity: '4', floor: '1' });
    }
    setShowTableModal(true);
  };

  const saveTable = () => {
    const number = Number(tableForm.number);
    const capacity = Number(tableForm.capacity);
    const floor = Number(tableForm.floor);
    if (!number || !capacity || !floor) {
      error('Please enter valid table details.');
      return;
    }

    const duplicate = tables.find((table) => table.number === number && table.id !== editingTable?.id);
    if (duplicate) {
      error('A table with this number already exists.');
      return;
    }

    if (editingTable) {
      tableDB.update(editingTable.id, { number, capacity, floor });
      success('Table updated successfully.');
    } else {
      tableDB.create({ number, capacity, floor, status: 'available' });
      success('Table created successfully.');
    }

    setShowTableModal(false);
    loadTables();
  };

  const reserveTable = () => {
    if (!selectedTable || !reservationForm.customerName.trim() || !reservationForm.reservationTime) {
      error('Please complete reservation details.');
      return;
    }
    tableDB.update(selectedTable.id, {
      status: 'reserved',
      reservationInfo: {
        customerName: reservationForm.customerName.trim(),
        customerPhone: reservationForm.customerPhone.trim(),
        reservationTime: reservationForm.reservationTime,
        partySize: Number(reservationForm.partySize) || selectedTable.capacity,
      },
    });
    setShowReserveModal(false);
    setSelectedTable(null);
    success('Table reserved successfully.');
    loadTables();
  };

  const clearReservation = (table: Table) => {
    tableDB.update(table.id, { status: 'available', reservationInfo: undefined });
    success(`Reservation cleared for Table ${table.number}.`);
    loadTables();
  };

  const deleteTable = (table: Table) => {
    if (table.currentOrderId || table.status === 'occupied') {
      error('Cannot delete a table with an active order.');
      return;
    }
    if (!window.confirm(`Delete Table ${table.number}?`)) return;
    tableDB.delete(table.id);
    success('Table deleted.');
    loadTables();
  };

  const moveOrder = (table: Table) => {
    if (!table.currentOrderId) {
      error('This table has no active order to move.');
      return;
    }
    const targetNumber = Number(window.prompt('Move to table number:', ''));
    if (!targetNumber) return;
    const target = tables.find((item) => item.number === targetNumber);
    if (!target) {
      error('Target table not found.');
      return;
    }
    if (target.status !== 'available') {
      error('Target table is not available.');
      return;
    }

    const order = orderDB.getById(table.currentOrderId);
    if (!order) {
      error('Active order not found.');
      return;
    }

    orderDB.update(order.id, { tableId: target.id, tableNumber: target.number });
    tableDB.update(target.id, { status: 'occupied', currentOrderId: order.id });
    tableDB.update(table.id, { status: 'available', currentOrderId: undefined });
    success(`Moved ${order.orderNumber} to Table ${target.number}.`);
    loadTables();
  };

  const stats = {
    available: tables.filter((table) => table.status === 'available').length,
    occupied: tables.filter((table) => table.status === 'occupied').length,
    reserved: tables.filter((table) => table.status === 'reserved').length,
    cleaning: tables.filter((table) => table.status === 'cleaning').length,
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Table Management"
        description="Create tables, manage occupancy, reservations, and move orders between tables."
        action={canManageTableStructure(user?.role) ? <Button onClick={() => openTableModal()} leftIcon={<Plus size={16} />}>Add Table</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Available" value={stats.available} icon={<CheckCircle2 size={20} />} color="green" />
        <StatCard title="Occupied" value={stats.occupied} icon={<Users size={20} />} color="red" />
        <StatCard title="Reserved" value={stats.reserved} icon={<Receipt size={20} />} color="yellow" />
        <StatCard title="Cleaning" value={stats.cleaning} icon={<RefreshCw size={20} />} color="purple" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables.map((table) => (
          <Card key={table.id} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">Table {table.number}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Capacity {table.capacity} • Floor {table.floor}</p>
              </div>
              <StatusBadge status={table.status} />
            </div>

            {table.reservationInfo && (
              <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100">
                <p className="font-medium">Reserved for {table.reservationInfo.customerName}</p>
                <p>{table.reservationInfo.customerPhone || 'No phone'}</p>
                <p>{format(new Date(table.reservationInfo.reservationTime), 'PPP p')}</p>
                <p>Party size: {table.reservationInfo.partySize}</p>
              </div>
            )}

            {table.currentOrderId && (
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
                Active order: {orderDB.getById(table.currentOrderId)?.orderNumber || table.currentOrderId}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {canManageTableStructure(user?.role) ? (
                <Button variant="outline" onClick={() => openTableModal(table)} leftIcon={<Edit size={14} />}>Edit</Button>
              ) : (
                <div />
              )}

              {canOperateTables(user?.role) && table.status === 'available' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedTable(table);
                    setReservationForm({ customerName: '', customerPhone: '', reservationTime: '', partySize: String(table.capacity) });
                    setShowReserveModal(true);
                  }}
                >
                  Reserve
                </Button>
              ) : canOperateTables(user?.role) && table.status === 'reserved' ? (
                <Button variant="secondary" onClick={() => clearReservation(table)}>Clear</Button>
              ) : canOperateTables(user?.role) ? (
                <Button variant="secondary" onClick={() => tableDB.update(table.id, { status: table.status === 'cleaning' ? 'available' : 'cleaning' }) || loadTables()}>
                  {table.status === 'cleaning' ? 'Ready' : 'Cleaning'}
                </Button>
              ) : (
                <div />
              )}

              {canOperateTables(user?.role) && table.status === 'occupied' ? (
                <Button variant="outline" onClick={() => moveOrder(table)} leftIcon={<ArrowRightLeft size={14} />}>Move</Button>
              ) : canManageTableStructure(user?.role) ? (
                <Button variant="ghost" onClick={() => deleteTable(table)} leftIcon={<Trash2 size={14} />}>Delete</Button>
              ) : (
                <div />
              )}
              <Button
                variant="secondary"
                className="col-span-2"
                onClick={() => { setQrTableNumber(table.number); setShowQRModal(true); }}
                leftIcon={<QrCode size={14} />}
              >
                QR Order
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={showTableModal && canManageTableStructure(user?.role)} onClose={() => setShowTableModal(false)} title={editingTable ? 'Edit Table' : 'Add Table'}>
        <div className="space-y-4">
          <Input label="Table Number" type="number" value={tableForm.number} onChange={(e) => setTableForm((prev) => ({ ...prev, number: e.target.value }))} />
          <Input label="Capacity" type="number" value={tableForm.capacity} onChange={(e) => setTableForm((prev) => ({ ...prev, capacity: e.target.value }))} />
          <Input label="Floor" type="number" value={tableForm.floor} onChange={(e) => setTableForm((prev) => ({ ...prev, floor: e.target.value }))} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowTableModal(false)}>Cancel</Button>
            <Button onClick={saveTable}>Save Table</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showReserveModal} onClose={() => setShowReserveModal(false)} title={selectedTable ? `Reserve Table ${selectedTable.number}` : 'Reserve Table'}>
        <div className="space-y-4">
          <Input label="Customer Name" value={reservationForm.customerName} onChange={(e) => setReservationForm((prev) => ({ ...prev, customerName: e.target.value }))} />
          <Input label="Customer Phone" value={reservationForm.customerPhone} onChange={(e) => setReservationForm((prev) => ({ ...prev, customerPhone: e.target.value }))} />
          <Input label="Reservation Time" type="datetime-local" value={reservationForm.reservationTime} onChange={(e) => setReservationForm((prev) => ({ ...prev, reservationTime: e.target.value }))} />
          <Input label="Party Size" type="number" value={reservationForm.partySize} onChange={(e) => setReservationForm((prev) => ({ ...prev, partySize: e.target.value }))} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowReserveModal(false)}>Cancel</Button>
            <Button onClick={reserveTable}>Confirm Reservation</Button>
          </div>
        </div>
      </Modal>

      {/* QR Code Modal */}
      <QRCodeModal isOpen={showQRModal} onClose={() => setShowQRModal(false)} tableNumber={qrTableNumber} />
    </div>
  );
}

export function InventoryManagementPage() {
  const { success, error, warning } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [search, setSearch] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', unit: 'kg', quantity: '0', minQuantity: '0', costPerUnit: '0', supplierId: '', isActive: true });
  const [purchaseForm, setPurchaseForm] = useState({ inventoryItemId: '', quantity: '1', unitCost: '0', supplierId: '', invoiceNumber: '', purchaseDate: new Date().toISOString().split('T')[0], notes: '' });

  const loadData = () => {
    const inventory = inventoryDB.getAll();
    setItems(inventory);
    setSuppliers(supplierDB.getAll());
    setPurchases(purchaseDB.getAll().sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()));

    const lowStock = inventory.filter((item) => item.isActive && item.quantity <= item.minQuantity);
    if (lowStock.length > 0) {
      warning(`${lowStock.length} inventory item(s) are low in stock.`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const lowStockItems = items.filter((item) => item.isActive && item.quantity <= item.minQuantity);
  const filteredItems = items.filter((item) => `${item.name} ${item.unit}`.toLowerCase().includes(search.toLowerCase()));
  const inventoryValue = items.reduce((sum, item) => sum + item.quantity * item.costPerUnit, 0);
  const canManageInventoryModule = canManageInventory(user?.role);
  const canDeleteInventoryItems = canDeleteInventory(user?.role);

  const openItemModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name,
        unit: item.unit,
        quantity: String(item.quantity),
        minQuantity: String(item.minQuantity),
        costPerUnit: String(item.costPerUnit),
        supplierId: item.supplierId || '',
        isActive: item.isActive,
      });
    } else {
      setEditingItem(null);
      setItemForm({ name: '', unit: 'kg', quantity: '0', minQuantity: '0', costPerUnit: '0', supplierId: suppliers[0]?.id || '', isActive: true });
    }
    setShowItemModal(true);
  };

  const saveItem = () => {
    if (!canManageInventoryModule) {
      error('You do not have permission to modify inventory items.');
      return;
    }
    if (!itemForm.name.trim()) {
      error('Please enter inventory item name.');
      return;
    }

    const payload = {
      name: itemForm.name.trim(),
      unit: itemForm.unit.trim(),
      quantity: Number(itemForm.quantity),
      minQuantity: Number(itemForm.minQuantity),
      costPerUnit: Number(itemForm.costPerUnit),
      supplierId: itemForm.supplierId || undefined,
      isActive: itemForm.isActive,
    };

    if (editingItem) {
      inventoryDB.update(editingItem.id, payload);
      success('Inventory item updated.');
    } else {
      inventoryDB.create(payload);
      success('Inventory item created.');
    }
    setShowItemModal(false);
    loadData();
  };

  const openPurchaseModal = (item?: InventoryItem) => {
    setPurchaseForm({
      inventoryItemId: item?.id || items[0]?.id || '',
      quantity: '1',
      unitCost: item ? String(item.costPerUnit) : '0',
      supplierId: item?.supplierId || suppliers[0]?.id || '',
      invoiceNumber: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setShowPurchaseModal(true);
  };

  const savePurchase = () => {
    if (!canManageInventoryModule) {
      error('You do not have permission to create purchase entries.');
      return;
    }
    const inventoryItem = items.find((item) => item.id === purchaseForm.inventoryItemId);
    if (!inventoryItem) {
      error('Please select an inventory item.');
      return;
    }
    const supplier = suppliers.find((item) => item.id === purchaseForm.supplierId);
    purchaseDB.create({
      inventoryItemId: inventoryItem.id,
      inventoryItemName: inventoryItem.name,
      quantity: Number(purchaseForm.quantity),
      unitCost: Number(purchaseForm.unitCost),
      totalCost: Number(purchaseForm.quantity) * Number(purchaseForm.unitCost),
      supplierId: purchaseForm.supplierId || undefined,
      supplierName: supplier?.name,
      invoiceNumber: purchaseForm.invoiceNumber.trim() || undefined,
      purchaseDate: purchaseForm.purchaseDate,
      notes: purchaseForm.notes.trim() || undefined,
    });
    addNotification('inventory', 'Stock Updated', `${inventoryItem.name} stock increased by ${purchaseForm.quantity} ${inventoryItem.unit}.`);
    success('Purchase entry saved and stock updated.');
    setShowPurchaseModal(false);
    loadData();
  };

  const deleteItem = (item: InventoryItem) => {
    if (!canDeleteInventoryItems) {
      error('Only admin can permanently delete inventory items.');
      return;
    }
    if (!window.confirm(`Delete ${item.name}?`)) return;
    inventoryDB.delete(item.id);
    success('Inventory item deleted.');
    loadData();
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Inventory Management"
        description="Track ingredients, low stock alerts, stock value, and purchase entries."
        action={canManageInventoryModule ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openPurchaseModal()} leftIcon={<PackagePlus size={16} />}>
              Add Purchase
            </Button>
            <Button onClick={() => openItemModal()} leftIcon={<Plus size={16} />}>
              Add Item
            </Button>
          </div>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Inventory Items" value={items.length} icon={<PackagePlus size={20} />} color="blue" />
        <StatCard title="Low Stock Alerts" value={lowStockItems.length} icon={<AlertTriangle size={20} />} color="yellow" />
        <StatCard title="Suppliers Linked" value={items.filter((item) => item.supplierId).length} icon={<Truck size={20} />} color="purple" />
        <StatCard title="Inventory Value" value={currency(inventoryValue)} icon={<Receipt size={20} />} color="green" />
      </div>

      {lowStockItems.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-yellow-600 dark:text-yellow-400" size={20} />
            <div>
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Low Stock Alert</h3>
              <p className="mt-1 text-sm text-yellow-800 dark:text-yellow-200">
                {lowStockItems.map((item) => `${item.name} (${item.quantity}${item.unit})`).join(', ')}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Tabs
        variant="underline"
        tabs={[
          {
            id: 'stock',
            label: 'Current Stock',
            content: (
              <div className="space-y-4">
                <Card>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Input placeholder="Search ingredients or items" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search size={16} />} />
                    <div className="flex items-center justify-end text-sm text-gray-500 dark:text-gray-400">{filteredItems.length} item(s)</div>
                  </div>
                </Card>
                <DataTable
                  columns={[
                    {
                      key: 'name',
                      header: 'Item',
                      render: (item) => (
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Unit: {item.unit}</p>
                        </div>
                      ),
                    },
                    { key: 'quantity', header: 'Quantity', render: (item) => `${item.quantity} ${item.unit}` },
                    { key: 'minQuantity', header: 'Min Level', render: (item) => `${item.minQuantity} ${item.unit}` },
                    { key: 'costPerUnit', header: 'Unit Cost', render: (item) => currency(item.costPerUnit) },
                    {
                      key: 'status',
                      header: 'Status',
                      render: (item) => item.quantity <= item.minQuantity ? <Badge variant="warning">Low stock</Badge> : <Badge variant="success">Healthy</Badge>,
                    },
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (item) => (
                        <div className="flex flex-wrap gap-2">
                          {canManageInventoryModule && (
                            <Button size="sm" variant="outline" onClick={() => openPurchaseModal(item)} leftIcon={<Plus size={14} />}>
                              Restock
                            </Button>
                          )}
                          {canManageInventoryModule && (
                            <Button size="sm" variant="ghost" onClick={() => openItemModal(item)} leftIcon={<Edit size={14} />}>
                              Edit
                            </Button>
                          )}
                          {canDeleteInventoryItems && (
                            <Button size="sm" variant="danger" onClick={() => deleteItem(item)} leftIcon={<Trash2 size={14} />}>
                              Delete
                            </Button>
                          )}
                          {!canManageInventoryModule && !canDeleteInventoryItems && <span className="text-sm text-gray-400">View only</span>}
                        </div>
                      ),
                    },
                  ]}
                  data={filteredItems}
                  keyExtractor={(item) => item.id}
                  emptyMessage="No inventory items found"
                />
              </div>
            ),
          },
          {
            id: 'purchases',
            label: 'Purchase History',
            content: (
              <DataTable
                columns={[
                  { key: 'inventoryItemName', header: 'Item' },
                  { key: 'quantity', header: 'Qty', render: (item) => `${item.quantity}` },
                  { key: 'unitCost', header: 'Unit Cost', render: (item) => currency(item.unitCost) },
                  { key: 'totalCost', header: 'Total', render: (item) => currency(item.totalCost) },
                  { key: 'supplierName', header: 'Supplier', render: (item) => item.supplierName || '—' },
                  { key: 'purchaseDate', header: 'Date', render: (item) => format(new Date(item.purchaseDate), 'PPP') },
                ]}
                data={purchases}
                keyExtractor={(item) => item.id}
                emptyMessage="No purchase history available"
              />
            ),
          },
        ]}
      />

      <Modal isOpen={showItemModal && canManageInventoryModule} onClose={() => setShowItemModal(false)} title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}>
        <div className="space-y-4">
          <Input label="Item Name" value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Unit" value={itemForm.unit} onChange={(e) => setItemForm((prev) => ({ ...prev, unit: e.target.value }))} />
            <Input label="Current Quantity" type="number" value={itemForm.quantity} onChange={(e) => setItemForm((prev) => ({ ...prev, quantity: e.target.value }))} />
            <Input label="Minimum Quantity" type="number" value={itemForm.minQuantity} onChange={(e) => setItemForm((prev) => ({ ...prev, minQuantity: e.target.value }))} />
            <Input label="Cost per Unit" type="number" value={itemForm.costPerUnit} onChange={(e) => setItemForm((prev) => ({ ...prev, costPerUnit: e.target.value }))} />
          </div>
          <Select label="Supplier" value={itemForm.supplierId} onChange={(e) => setItemForm((prev) => ({ ...prev, supplierId: e.target.value }))} options={[{ value: '', label: 'No supplier' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Inventory item is active</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowItemModal(false)}>Cancel</Button>
            <Button onClick={saveItem}>Save Item</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPurchaseModal && canManageInventoryModule} onClose={() => setShowPurchaseModal(false)} title="Add Purchase Entry">
        <div className="space-y-4">
          <Select label="Inventory Item" value={purchaseForm.inventoryItemId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, inventoryItemId: e.target.value }))} options={items.map((item) => ({ value: item.id, label: item.name }))} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Quantity" type="number" value={purchaseForm.quantity} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, quantity: e.target.value }))} />
            <Input label="Unit Cost" type="number" value={purchaseForm.unitCost} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, unitCost: e.target.value }))} />
          </div>
          <Select label="Supplier" value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, supplierId: e.target.value }))} options={[{ value: '', label: 'No supplier' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Invoice Number" value={purchaseForm.invoiceNumber} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))} />
            <Input label="Purchase Date" type="date" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, purchaseDate: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={purchaseForm.notes} onChange={(e) => setPurchaseForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowPurchaseModal(false)}>Cancel</Button>
            <Button onClick={savePurchase}>Save Purchase</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function SuppliersPage() {
  useDbUpdate();
  const { success, error } = useToast();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', gstNumber: '', isActive: true });

  const loadSuppliers = () => setSuppliers(supplierDB.getAll());

  useEffect(() => {
    loadSuppliers();
  }, []);

  const canManageSupplierRecords = canManageSuppliers(user?.role);
  const canDeleteSupplierRecords = canDeleteSupplier(user?.role);

  const openModal = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setForm({ name: supplier.name, email: supplier.email, phone: supplier.phone, address: supplier.address, gstNumber: supplier.gstNumber || '', isActive: supplier.isActive });
    } else {
      setEditingSupplier(null);
      setForm({ name: '', email: '', phone: '', address: '', gstNumber: '', isActive: true });
    }
    setShowModal(true);
  };

  const saveSupplier = () => {
    if (!canManageSupplierRecords) {
      error('You do not have permission to manage suppliers.');
      return;
    }
    if (!form.name.trim()) {
      error('Please enter supplier name.');
      return;
    }
    const payload = { ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim(), gstNumber: form.gstNumber.trim() || undefined };
    if (editingSupplier) {
      supplierDB.update(editingSupplier.id, payload);
      success('Supplier updated successfully.');
    } else {
      supplierDB.create(payload);
      success('Supplier created successfully.');
    }
    setShowModal(false);
    loadSuppliers();
  };

  const deleteSupplier = (supplier: Supplier) => {
    if (!canDeleteSupplierRecords) {
      error('Only admin can permanently delete suppliers.');
      return;
    }
    if (!window.confirm(`Delete supplier ${supplier.name}?`)) return;
    supplierDB.delete(supplier.id);
    success('Supplier deleted.');
    loadSuppliers();
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Supplier Management"
        description="Manage local vendors, supplier contacts, GST details, and purchasing sources."
        action={canManageSupplierRecords ? <Button onClick={() => openModal()} leftIcon={<Plus size={16} />}>Add Supplier</Button> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Suppliers" value={suppliers.length} icon={<Truck size={20} />} color="blue" />
        <StatCard title="Active Suppliers" value={suppliers.filter((supplier) => supplier.isActive).length} icon={<CheckCircle2 size={20} />} color="green" />
        <StatCard title="Inactive Suppliers" value={suppliers.filter((supplier) => !supplier.isActive).length} icon={<AlertTriangle size={20} />} color="yellow" />
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Supplier',
            render: (supplier) => (
              <div>
                <p className="font-medium">{supplier.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">GST: {supplier.gstNumber || '—'}</p>
              </div>
            ),
          },
          { key: 'email', header: 'Email', render: (supplier) => supplier.email || '—' },
          { key: 'phone', header: 'Phone', render: (supplier) => supplier.phone || '—' },
          { key: 'address', header: 'Address' },
          { key: 'isActive', header: 'Status', render: (supplier) => <Badge variant={supplier.isActive ? 'success' : 'warning'}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'actions',
            header: 'Actions',
            render: (supplier) => (
              <div className="flex flex-wrap gap-2">
                {canManageSupplierRecords && (
                  <Button size="sm" variant="ghost" onClick={() => openModal(supplier)} leftIcon={<Edit size={14} />}>
                    Edit
                  </Button>
                )}
                {canDeleteSupplierRecords && (
                  <Button size="sm" variant="danger" onClick={() => deleteSupplier(supplier)} leftIcon={<Trash2 size={14} />}>
                    Delete
                  </Button>
                )}
                {!canManageSupplierRecords && !canDeleteSupplierRecords && <span className="text-sm text-gray-400">View only</span>}
              </div>
            ),
          },
        ]}
        data={suppliers}
        keyExtractor={(supplier) => supplier.id}
        emptyMessage="No suppliers available"
      />

      <Modal isOpen={showModal && canManageSupplierRecords} onClose={() => setShowModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
        <div className="space-y-4">
          <Input label="Supplier Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
          </div>
          <Textarea label="Address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} rows={3} />
          <Input label="GST Number" value={form.gstNumber} onChange={(e) => setForm((prev) => ({ ...prev, gstNumber: e.target.value }))} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Supplier is active</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={saveSupplier}>Save Supplier</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function EmployeeManagementPage() {
  const { success, error } = useToast();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'waiter' as UserRole, salary: '0', shift: 'morning', joiningDate: new Date().toISOString().split('T')[0], isActive: true, address: '' });

  const loadEmployees = () => setEmployees(employeeDB.getAll());

  useEffect(() => {
    loadEmployees();
  }, []);

  const canManageEmployeeModule = canManageEmployees(user?.role);
  const assignableRoleOptions = roleOptions.filter((option) => canAssignEmployeeRole(user?.role, option.value));

  const openModal = (employee?: Employee) => {
    if (!canManageEmployeeModule) {
      error('You do not have permission to manage employee records.');
      return;
    }

    if (employee) {
      if (!canEditEmployeeRecord(user?.role, employee.role)) {
        error('You are not allowed to edit this employee role.');
        return;
      }
      setEditingEmployee(employee);
      setForm({
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        role: employee.role,
        salary: String(employee.salary),
        shift: employee.shift,
        joiningDate: employee.joiningDate,
        isActive: employee.isActive,
        address: employee.address || '',
      });
    } else {
      setEditingEmployee(null);
      setForm({
        name: '',
        email: '',
        phone: '',
        role: assignableRoleOptions[0]?.value || 'waiter',
        salary: '0',
        shift: 'morning',
        joiningDate: new Date().toISOString().split('T')[0],
        isActive: true,
        address: '',
      });
    }
    setShowModal(true);
  };

  const saveEmployee = () => {
    if (!canManageEmployeeModule) {
      error('You do not have permission to manage employee records.');
      return;
    }
    if (!canAssignEmployeeRole(user?.role, form.role)) {
      error('You are not allowed to assign this employee role.');
      return;
    }
    if (editingEmployee && !canEditEmployeeRecord(user?.role, editingEmployee.role)) {
      error('You are not allowed to edit this employee record.');
      return;
    }
    if (!form.name.trim()) {
      error('Please enter employee name.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role,
      salary: Number(form.salary),
      shift: form.shift as Employee['shift'],
      joiningDate: form.joiningDate,
      isActive: form.isActive,
      address: form.address.trim() || undefined,
    };

    if (editingEmployee) {
      employeeDB.update(editingEmployee.id, payload);
      success('Employee updated.');
    } else {
      employeeDB.create(payload);
      success('Employee created.');
    }
    setShowModal(false);
    loadEmployees();
  };

  const deleteEmployee = (employee: Employee) => {
    if (!canDeleteEmployeeRecord(user?.role, employee.role)) {
      error('You are not allowed to delete this employee record.');
      return;
    }
    if (!window.confirm(`Delete employee ${employee.name}?`)) return;
    employeeDB.delete(employee.id);
    success('Employee deleted.');
    loadEmployees();
  };

  const totalSalary = employees.reduce((sum, employee) => sum + employee.salary, 0);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Employee Management"
        description="Manage staff records, roles, salaries, shifts, and employment status."
        action={canManageEmployeeModule ? <Button onClick={() => openModal()} leftIcon={<Plus size={16} />}>Add Employee</Button> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Employees" value={employees.length} icon={<Users size={20} />} color="blue" />
        <StatCard title="Active Staff" value={employees.filter((employee) => employee.isActive).length} icon={<CheckCircle2 size={20} />} color="green" />
        <StatCard title="Managers & Admin" value={employees.filter((employee) => ['manager', 'admin'].includes(employee.role)).length} icon={<UserCog size={20} />} color="purple" />
        <StatCard title="Monthly Salary" value={currency(totalSalary)} icon={<Receipt size={20} />} color="yellow" />
      </div>

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Employee',
            render: (employee) => (
              <div>
                <p className="font-medium">{employee.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{employee.email || employee.phone || 'No contact'}</p>
              </div>
            ),
          },
          { key: 'role', header: 'Role', render: (employee) => <Badge variant="primary">{employee.role}</Badge> },
          { key: 'shift', header: 'Shift', render: (employee) => employee.shift },
          { key: 'salary', header: 'Salary', render: (employee) => currency(employee.salary) },
          { key: 'joiningDate', header: 'Joining Date', render: (employee) => format(new Date(employee.joiningDate), 'PPP') },
          { key: 'status', header: 'Status', render: (employee) => <Badge variant={employee.isActive ? 'success' : 'warning'}>{employee.isActive ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'actions',
            header: 'Actions',
            render: (employee) => {
              const canEditThisEmployee = canEditEmployeeRecord(user?.role, employee.role);
              const canDeleteThisEmployee = canDeleteEmployeeRecord(user?.role, employee.role);
              return (
                <div className="flex flex-wrap gap-2">
                  {canEditThisEmployee && (
                    <Button size="sm" variant="ghost" onClick={() => openModal(employee)} leftIcon={<Edit size={14} />}>
                      Edit
                    </Button>
                  )}
                  {canDeleteThisEmployee && (
                    <Button size="sm" variant="danger" onClick={() => deleteEmployee(employee)} leftIcon={<Trash2 size={14} />}>
                      Delete
                    </Button>
                  )}
                  {!canEditThisEmployee && !canDeleteThisEmployee && <span className="text-sm text-gray-400">Restricted</span>}
                </div>
              );
            },
          },
        ]}
        data={employees}
        keyExtractor={(employee) => employee.id}
        emptyMessage="No employees found"
      />

      <Modal isOpen={showModal && canManageEmployeeModule} onClose={() => setShowModal(false)} title={editingEmployee ? 'Edit Employee' : 'Add Employee'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Full Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Select label="Role" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))} options={assignableRoleOptions} />
            <Input label="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            <Input label="Salary" type="number" value={form.salary} onChange={(e) => setForm((prev) => ({ ...prev, salary: e.target.value }))} />
            <Select label="Shift" value={form.shift} onChange={(e) => setForm((prev) => ({ ...prev, shift: e.target.value }))} options={shiftOptions} />
            <Input label="Joining Date" type="date" value={form.joiningDate} onChange={(e) => setForm((prev) => ({ ...prev, joiningDate: e.target.value }))} />
          </div>
          <Textarea label="Address" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} rows={3} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Employee is active</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={saveEmployee}>Save Employee</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function ReportsPage() {
  const { success } = useToast();
  const settings = settingsDB.get();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [refreshKey, setRefreshKey] = useState(0);

  const orders = useMemo(() => orderDB.getByDateRange(startDate, endDate), [startDate, endDate, refreshKey]);
  const payments = useMemo(() => paymentDB.getAll().filter((payment) => {
    const day = payment.createdAt.split('T')[0];
    return day >= startDate && day <= endDate;
  }), [startDate, endDate, refreshKey]);
  const weeklySales = useMemo(() => analyticsDB.getWeeklySales(), [refreshKey]);
  const monthlySales = useMemo(() => analyticsDB.getMonthlySales(), [refreshKey]);
  const bestSelling = useMemo(() => analyticsDB.getBestSellingItems(6), [refreshKey]);

  const completedOrders = orders.filter((order) => order.status === 'completed');
  const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalDiscount = orders.reduce((sum, order) => sum + order.discount, 0);
  const totalTax = orders.reduce((sum, order) => sum + order.tax, 0);
  const paymentMix = [
    { name: 'Cash', value: payments.filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amount, 0) },
    { name: 'Card', value: payments.filter((payment) => payment.method === 'card').reduce((sum, payment) => sum + payment.amount, 0) },
    { name: 'UPI', value: payments.filter((payment) => payment.method === 'upi').reduce((sum, payment) => sum + payment.amount, 0) },
  ].filter((item) => item.value > 0);

  const exportCsv = () => {
    const rows = [
      ['Order Number', 'Date', 'Customer', 'Type', 'Status', 'Items', 'Tax', 'Discount', 'Total'].join(','),
      ...orders.map((order) => [
        order.orderNumber,
        format(new Date(order.createdAt), 'yyyy-MM-dd HH:mm'),
        order.customerName || 'Walk-in',
        order.type,
        order.status,
        order.items.length,
        order.tax.toFixed(2),
        order.discount.toFixed(2),
        order.total.toFixed(2),
      ].join(',')),
    ].join('\n');
    downloadFile(`restaurant-report-${startDate}-to-${endDate}.csv`, rows, 'text/csv;charset=utf-8;');
    success('CSV report exported successfully.');
  };

  const exportPdf = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(18);
    pdf.text(`${settings.restaurantName} Report`, 14, 18);
    pdf.setFontSize(10);
    pdf.text(`Period: ${startDate} to ${endDate}`, 14, 26);
    pdf.text(`Revenue: ${currency(totalRevenue, settings.currencySymbol)}`, 14, 32);
    pdf.text(`Completed Orders: ${completedOrders.length}`, 14, 38);

    autoTable(pdf, {
      startY: 46,
      head: [['Order', 'Date', 'Customer', 'Status', 'Items', 'Total']],
      body: orders.map((order) => [
        order.orderNumber,
        format(new Date(order.createdAt), 'PP p'),
        order.customerName || 'Walk-in',
        order.status,
        String(order.items.length),
        currency(order.total, settings.currencySymbol),
      ]),
    });

    pdf.save(`restaurant-report-${startDate}-to-${endDate}.pdf`);
    success('PDF report exported successfully.');
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reports & Analytics"
        description="Monitor daily sales, monthly revenue, best sellers, and export business reports."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRefreshKey((value) => value + 1)} leftIcon={<RefreshCw size={16} />}>
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCsv} leftIcon={<Download size={16} />}>
              Export CSV
            </Button>
            <Button onClick={exportPdf} leftIcon={<FileDown size={16} />}>
              Export PDF
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="flex items-end">
            <Button className="w-full" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>
              Apply Range
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Revenue" value={currency(totalRevenue, settings.currencySymbol)} icon={<Receipt size={20} />} color="green" />
        <StatCard title="Orders" value={orders.length} icon={<UtensilsCrossed size={20} />} color="blue" />
        <StatCard title="Tax Collected" value={currency(totalTax, settings.currencySymbol)} icon={<Receipt size={20} />} color="purple" />
        <StatCard title="Discount Given" value={currency(totalDiscount, settings.currencySymbol)} icon={<Receipt size={20} />} color="yellow" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Monthly Revenue Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySales.map((day) => ({ label: format(new Date(day.date), 'MMM d'), revenue: day.totalRevenue }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" hide />
                <YAxis />
                <Tooltip formatter={(value) => currency(Number(value), settings.currencySymbol)} />
                <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Payment Mix</h3>
          <div className="h-72">
            {paymentMix.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMix} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={4}>
                    {paymentMix.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => currency(Number(value), settings.currencySymbol)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500 dark:text-gray-400">No payment data</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Weekly Sales</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySales.map((day) => ({ label: format(new Date(day.date), 'EEE'), revenue: day.totalRevenue }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(value) => currency(Number(value), settings.currencySymbol)} />
                <Bar dataKey="revenue" fill="#10B981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Best Selling Items</h3>
          <div className="space-y-3">
            {bestSelling.length === 0 ? (
              <p className="py-8 text-center text-gray-500 dark:text-gray-400">No sales data available.</p>
            ) : (
              bestSelling.map((item, index) => (
                <div key={item.itemId} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{item.itemName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{item.quantity} sold</p>
                    </div>
                  </div>
                  <p className="font-semibold text-green-600 dark:text-green-400">{currency(item.revenue, settings.currencySymbol)}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <DataTable
        columns={[
          { key: 'orderNumber', header: 'Order' },
          { key: 'createdAt', header: 'Date', render: (order) => format(new Date(order.createdAt), 'PP p') },
          { key: 'customerName', header: 'Customer', render: (order) => order.customerName || 'Walk-in' },
          { key: 'status', header: 'Status', render: (order) => <StatusBadge status={order.status} /> },
          { key: 'items', header: 'Items', render: (order) => order.items.length },
          { key: 'total', header: 'Total', render: (order) => currency(order.total, settings.currencySymbol) },
          {
            key: 'actions',
            header: 'Actions',
            render: (order) => (
              <Button size="sm" variant="outline" onClick={() => printInvoice(order)} leftIcon={<Printer size={14} />}>
                Invoice
              </Button>
            ),
          },
        ]}
        data={orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
        keyExtractor={(order) => order.id}
        emptyMessage="No orders found in selected range"
      />
    </div>
  );
}

export function SettingsPage() {
  useDbUpdate();
  const { success, error, info } = useToast();
  const { setTheme } = useTheme();
  const [form, setForm] = useState<AppSettings>(settingsDB.get());
  const [isImporting, setIsImporting] = useState(false);

  const saveSettings = () => {
    settingsDB.update(form);
    setTheme(form.theme);
    success('Settings saved successfully.');
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const content = await file.text();
      const restored = backupDB.import(content);
      if (!restored) {
        error('Backup restore failed.');
        return;
      }
      success('Backup restored successfully. Reloading application...');
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      error('Unable to read backup file.');
    } finally {
      setIsImporting(false);
    }
  };

  const manualLocalBackup = () => {
    const snapshot = backupDB.export();
    localStorage.setItem('restaurant_last_backup', snapshot);
    info('Local backup saved inside browser storage.');
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Application Settings"
        description="Configure restaurant details, tax, theme, language, backup and restore options."
        action={<Button onClick={saveSettings} leftIcon={<Save size={16} />}>Save Settings</Button>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Restaurant Profile</h3>
          <Input label="Restaurant Name" value={form.restaurantName} onChange={(e) => setForm((prev) => ({ ...prev, restaurantName: e.target.value }))} />
          <Textarea label="Address" value={form.restaurantAddress} onChange={(e) => setForm((prev) => ({ ...prev, restaurantAddress: e.target.value }))} rows={3} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Phone" value={form.restaurantPhone} onChange={(e) => setForm((prev) => ({ ...prev, restaurantPhone: e.target.value }))} />
            <Input label="GST Number" value={form.gstNumber} onChange={(e) => setForm((prev) => ({ ...prev, gstNumber: e.target.value }))} />
            <Input label="Tax Percentage" type="number" value={String(form.taxPercentage)} onChange={(e) => setForm((prev) => ({ ...prev, taxPercentage: Number(e.target.value) }))} />
            <Input label="Backup Interval (hours)" type="number" value={String(form.backupInterval)} onChange={(e) => setForm((prev) => ({ ...prev, backupInterval: Number(e.target.value) }))} />
            <Select
              label="Region & Currency"
              value={form.currency}
              onChange={(e) => {
                const code = e.target.value;
                const preset = SUPPORTED_CURRENCIES.find((c) => c.code === code);
                if (preset) {
                  setForm((prev) => ({
                    ...prev,
                    currency: preset.code,
                    currencySymbol: preset.symbol,
                  }));
                } else {
                  setForm((prev) => ({ ...prev, currency: code }));
                }
              }}
              options={SUPPORTED_CURRENCIES.map((c) => ({
                value: c.code,
                label: `${c.label} (${c.region})`,
              }))}
            />
            <Input
              label="Currency Symbol"
              value={form.currencySymbol}
              onChange={(e) => setForm((prev) => ({ ...prev, currencySymbol: e.target.value }))}
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Appearance & Localization</h3>
          <Select label="Theme" value={form.theme} onChange={(e) => setForm((prev) => ({ ...prev, theme: e.target.value as AppSettings['theme'] }))} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Select label="Language" value={form.language} onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value as AppSettings['language'] }))} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' }, { value: 'hi', label: 'Hindi' }]} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={form.autoBackup} onChange={(e) => setForm((prev) => ({ ...prev, autoBackup: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable automatic backups</span>
          </label>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/60">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Multi-language support and theme selection are stored locally, so the application remains fully offline-first.
            </p>
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Data Management</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => backupDB.downloadBackup()} leftIcon={<Download size={16} />}>
            Download Backup
          </Button>
          <Button variant="outline" onClick={manualLocalBackup} leftIcon={<Save size={16} />}>
            Save Local Backup
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
            <Upload size={16} />
            {isImporting ? 'Importing...' : 'Restore Backup'}
            <input type="file" accept="application/json" className="hidden" onChange={(e) => void importBackup(e.target.files?.[0] || null)} />
          </label>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
          Exported backup files contain users, menu, orders, payments, inventory, suppliers, employees, settings, and notifications.
        </div>
      </Card>
    </div>
  );
}

export function UserManagementPage() {
  const { success, error } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'waiter' as UserRole, isActive: true });

  const loadUsers = () => setUsers(userDB.getAll());

  useEffect(() => {
    loadUsers();
  }, []);

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setForm({ username: user.username, password: '', role: user.role, isActive: user.isActive });
    } else {
      setEditingUser(null);
      setForm({ username: '', password: '', role: 'waiter', isActive: true });
    }
    setShowModal(true);
  };

  const saveUser = () => {
    if (!form.username.trim()) {
      error('Please enter a username.');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      error('Please enter a password.');
      return;
    }
    const existing = users.find((user) => user.username.toLowerCase() === form.username.trim().toLowerCase() && user.id !== editingUser?.id);
    if (existing) {
      error('Username already exists.');
      return;
    }

    if (editingUser) {
      userDB.update(editingUser.id, {
        username: form.username.trim(),
        role: form.role,
        isActive: form.isActive,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      });
      success('User updated successfully.');
    } else {
      userDB.create({ username: form.username.trim(), password: form.password.trim(), role: form.role, isActive: form.isActive });
      success('User created successfully.');
    }

    setShowModal(false);
    loadUsers();
  };

  const deleteUser = (user: User) => {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    userDB.delete(user.id);
    success('User deleted.');
    loadUsers();
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="User Management"
        description="Create staff login accounts, roles, active states, and password updates."
        action={<Button onClick={() => openModal()} leftIcon={<Plus size={16} />}>Add User</Button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Users" value={users.length} icon={<Users size={20} />} color="blue" />
        <StatCard title="Active Users" value={users.filter((user) => user.isActive).length} icon={<CheckCircle2 size={20} />} color="green" />
        <StatCard title="Admins" value={users.filter((user) => user.role === 'admin').length} icon={<UserCog size={20} />} color="purple" />
        <StatCard title="Recently Active" value={users.filter((user) => user.lastLogin).length} icon={<Receipt size={20} />} color="yellow" />
      </div>

      <DataTable
        columns={[
          {
            key: 'username',
            header: 'Username',
            render: (user) => (
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Created {format(new Date(user.createdAt), 'PPP')}</p>
              </div>
            ),
          },
          { key: 'role', header: 'Role', render: (user) => <Badge variant="primary">{user.role}</Badge> },
          { key: 'isActive', header: 'Status', render: (user) => <Badge variant={user.isActive ? 'success' : 'warning'}>{user.isActive ? 'Active' : 'Disabled'}</Badge> },
          { key: 'lastLogin', header: 'Last Login', render: (user) => user.lastLogin ? format(new Date(user.lastLogin), 'PP p') : 'Never' },
          {
            key: 'actions',
            header: 'Actions',
            render: (user) => (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => openModal(user)} leftIcon={<Edit size={14} />}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => deleteUser(user)} leftIcon={<Trash2 size={14} />}>
                  Delete
                </Button>
              </div>
            ),
          },
        ]}
        data={users}
        keyExtractor={(user) => user.id}
        emptyMessage="No users found"
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingUser ? 'Edit User' : 'Add User'}>
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} />
          <Input label={editingUser ? 'New Password (optional)' : 'Password'} type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
          <Select label="Role" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))} options={roleOptions} />
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            <span className="text-sm text-gray-700 dark:text-gray-300">User account is active</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={saveUser}>Save User</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

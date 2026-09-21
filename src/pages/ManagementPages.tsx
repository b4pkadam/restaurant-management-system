import { useEffect, useMemo, useRef, useState } from 'react';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency, SUPPORTED_CURRENCIES } from '../utils/formatCurrency';
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  BellRing,
  CheckCircle2,
  ChefHat,
  CreditCard,
  Download,
  Edit,
  Eye,
  EyeOff,
  FileDown,
  Layers,
  Lock,
  PackagePlus,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
  Truck,
  Upload,
  UserCog,
  Users,
  UtensilsCrossed,
  Image as ImageIcon,
  X,
  Volume2,
  VolumeX,
  Cloud,
  Database,
  Settings,
} from 'lucide-react';
import {
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  parseFirebaseConfigSnippet,
  hasStoredFirebaseConfig,
  type FirebaseConfig,
} from '../services/firebaseConfig';
import {
  isFirebaseActive,
  initFirebase,
  testFirebaseConnection,
  checkFirebaseHealth,
  subscribeFirebaseStatus,
  getFirebaseConnectionState,
  resetFirebaseApp,
  type FirebaseConnectionState,
} from '../services/firebase';
import { firebaseSync } from '../services/firebaseSync';
import { validateUsername, validatePassword, USERNAME_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../utils/security';
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
import { useLanguage, SUPPORTED_LANGUAGES } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { v4 as uuidv4 } from 'uuid';
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
  acknowledgeWaiterCall,
} from '../database/db';
import { soundService } from '../services/soundService';
import type {
  AppSettings,
  Category,
  Employee,
  InventoryItem,
  MenuItem,
  MenuItemIngredient,
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

function StatChip({
  icon,
  label,
  value,
  color = 'blue',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
}) {
  const colorStyles = {
    blue: 'border-blue-200 bg-blue-50/70 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200',
    green: 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200',
    red: 'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200',
    yellow: 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200',
    purple: 'border-purple-200 bg-purple-50/70 text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-200',
  };

  const iconColors = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-rose-600 dark:text-rose-400',
    yellow: 'text-amber-600 dark:text-amber-400',
    purple: 'text-purple-600 dark:text-purple-400',
  };

  return (
    <div className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs shadow-2xs transition-all shrink-0', colorStyles[color])}>
      <span className={cn('shrink-0', iconColors[color])}>{icon}</span>
      <span className="font-medium opacity-80">{label}:</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  stats,
  action,
}: {
  title?: string;
  description?: string;
  stats?: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (!action && !title && !description && !stats) return null;

  if (!title && !description) {
    return (
      <div className="sticky top-14 z-20 -mt-3 sm:-mt-4 md:-mt-6 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2.5 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800/80 shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            {stats}
          </div>
          {action && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-auto">
              {action}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-14 z-20 -mt-3 sm:-mt-4 md:-mt-6 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2.5 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800/80 shadow-xs transition-all flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        {title && <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>}
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

import { printInvoice, downloadThermalReceiptPdf } from '../utils/printInvoice';

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
  const [itemForm, setItemForm] = useState<{
    name: string;
    description: string;
    categoryId: string;
    price: string;
    cost: string;
    imageUrl: string;
    barcode: string;
    isAvailable: boolean;
    isVeg: boolean;
    allowsSpiceLevel: boolean;
    includesDrink: boolean;
    preparationTime: string;
    ingredients: string;
    recipe: MenuItemIngredient[];
  }>({
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
    recipe: [],
  });
  const [selectedInvId, setSelectedInvId] = useState('');
  const [recipeQty, setRecipeQty] = useState('');
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: '🍽️',
    sortOrder: '1',
    isActive: true,
  });

  const tick = useDbUpdate();
  const inventoryItems = useMemo(() => inventoryDB.getAll().filter((i) => i.isActive !== false), [tick]);
  const selectedInvItem = useMemo(() => inventoryItems.find((i) => i.id === selectedInvId), [inventoryItems, selectedInvId]);

  const handleAddRecipeItem = () => {
    if (!selectedInvId || !recipeQty || Number(recipeQty) <= 0) return;
    const inv = inventoryItems.find((i) => i.id === selectedInvId);
    if (!inv) return;
    const qty = Number(recipeQty);
    const existingIdx = itemForm.recipe.findIndex((r) => r.inventoryItemId === selectedInvId);
    if (existingIdx !== -1) {
      const updated = [...itemForm.recipe];
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: Math.round((updated[existingIdx].quantity + qty) * 1000) / 1000,
      };
      setItemForm((prev) => ({ ...prev, recipe: updated }));
    } else {
      const newEntry: MenuItemIngredient = {
        inventoryItemId: inv.id,
        inventoryItemName: inv.name,
        quantity: qty,
        unit: inv.unit || 'unit',
      };
      setItemForm((prev) => ({ ...prev, recipe: [...prev.recipe, newEntry] }));
    }
    setSelectedInvId('');
    setRecipeQty('');
  };

  const handleRemoveRecipeItem = (invId: string) => {
    setItemForm((prev) => ({
      ...prev,
      recipe: prev.recipe.filter((r) => r.inventoryItemId !== invId),
    }));
  };

  const loadData = () => {
    const allCategories = categoryDB.getAll().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    setCategories(allCategories);
    setItems(menuItemDB.getAll());
  };

  useEffect(() => {
    loadData();
  }, [tick]);

  const categoryOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    categories.forEach((cat) => {
      map.set(cat.id, cat.sortOrder ?? 0);
    });
    return map;
  }, [categories]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesSearch = `${item.name} ${item.description || ''} ${item.barcode || ''}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const orderA = categoryOrderMap.get(a.categoryId) ?? 999;
      const orderB = categoryOrderMap.get(b.categoryId) ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [items, search, categoryFilter, categoryOrderMap]);

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
      recipe: [],
    });
    setSelectedInvId('');
    setRecipeQty('');
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
      recipe: Array.isArray(item.recipe) ? [...item.recipe] : [],
    });
    setSelectedInvId('');
    setRecipeQty('');
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
      recipe: itemForm.recipe.length > 0 ? itemForm.recipe : undefined,
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
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<UtensilsCrossed size={14} />} label="Categories" value={categories.filter((c) => c.isActive).length} color="blue" />
            <StatChip icon={<Receipt size={14} />} label="Items" value={items.length} color="green" />
            <StatChip icon={<EyeOff size={14} />} label="Hidden" value={items.filter((i) => !i.isAvailable).length} color="yellow" />
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }} leftIcon={<Plus size={14} />}>
              Add Category
            </Button>
            <Button size="sm" onClick={() => { resetItemForm(); setShowItemModal(true); }} leftIcon={<Plus size={14} />}>
              Add Menu Item
            </Button>
          </div>
        }
      />

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
                          {item.recipe && item.recipe.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                <Layers size={11} />
                                {item.recipe.length} recipe ingredient{item.recipe.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
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
          <Textarea label="Ingredients (comma separated)" value={itemForm.ingredients} onChange={(e) => setItemForm((prev) => ({ ...prev, ingredients: e.target.value }))} rows={2} />

          {/* Linked Recipe & Raw Inventory Stock Deduction */}
          <div className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Layers size={15} className="text-blue-600 dark:text-blue-400" />
                  <span>Recipe & Inventory Stock Link</span>
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Link raw ingredients and portion amounts to automatically deduct stock from inventory when this dish is ordered.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shrink-0">
                {itemForm.recipe.length} item{itemForm.recipe.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* List of currently linked recipe ingredients */}
            {itemForm.recipe.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {itemForm.recipe.map((ing) => {
                  const inv = inventoryItems.find((i) => i.id === ing.inventoryItemId);
                  return (
                    <div
                      key={ing.inventoryItemId}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                          {ing.inventoryItemName}
                        </span>
                        {inv && (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            (Current Stock: {inv.quantity} {inv.unit})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                          {ing.quantity} {ing.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipeItem(ing.inventoryItemId)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
                          title="Remove ingredient"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                No raw inventory items linked yet. Add ingredients below to enable automated stock tracking.
              </p>
            )}

            {/* Selector to add an ingredient */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-1 border-t border-gray-200 dark:border-gray-700/60">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Select Raw Stock Item
                </label>
                <select
                  value={selectedInvId}
                  onChange={(e) => setSelectedInvId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose Stock Item --</option>
                  {inventoryItems.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.quantity} {inv.unit} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-32">
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Portion ({selectedInvItem?.unit || 'unit'})
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  placeholder="e.g. 0.25"
                  value={recipeQty}
                  onChange={(e) => setRecipeQty(e.target.value)}
                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!selectedInvId || !recipeQty || Number(recipeQty) <= 0}
                onClick={handleAddRecipeItem}
                leftIcon={<Plus size={13} />}
                className="shrink-0 text-xs self-end"
              >
                Add Link
              </Button>
            </div>
          </div>

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

export interface EditOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  userRole?: string;
}

export function EditOrderModal({ order, isOpen, onClose, onSaved, userRole }: EditOrderModalProps) {
  const { success, error } = useToast();
  const settings = settingsDB.get();

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager';
  const isWaiter = userRole === 'waiter';
  const canFullEdit = isAdmin || isManager;

  const [editForm, setEditForm] = useState<{
    customerName: string;
    customerPhone: string;
    tableNumber: string;
    type: 'dine-in' | 'takeaway' | 'delivery';
    status: Order['status'];
    paymentStatus: 'paid' | 'pending';
    paymentMethod: 'cash' | 'card' | 'upi';
    discount: number;
    discountType: 'percentage' | 'fixed';
    notes: string;
    items: OrderItem[];
  }>({
    customerName: '',
    customerPhone: '',
    tableNumber: '',
    type: 'dine-in',
    status: 'active',
    paymentStatus: 'pending',
    paymentMethod: 'cash',
    discount: 0,
    discountType: 'percentage',
    notes: '',
    items: [],
  });

  const [selectedMenuItemToAdd, setSelectedMenuItemToAdd] = useState<string>('');

  const allMenuItems = useMemo(() => menuItemDB.getAll(), [order]);
  const allTables = useMemo(() => tableDB.getAll().sort((a, b) => a.number - b.number), [order]);

  useEffect(() => {
    if (order) {
      const payment = paymentDB.getByOrder(order.id);
      const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);
      setEditForm({
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        tableNumber: order.tableNumber ? String(order.tableNumber) : '',
        type: order.type,
        status: order.status,
        paymentStatus: isPaid ? 'paid' : 'pending',
        paymentMethod:
          payment?.method && ['cash', 'card', 'upi'].includes(payment.method)
            ? (payment.method as 'cash' | 'card' | 'upi')
            : 'cash',
        discount: order.discount || 0,
        discountType: order.discountType || 'percentage',
        notes: order.notes || '',
        items: JSON.parse(JSON.stringify(order.items || [])),
      });
      setSelectedMenuItemToAdd('');
    }
  }, [order]);

  const editSubtotal = useMemo(() => {
    return editForm.items.reduce((sum, item) => sum + Number(item.unitPrice) * Number(item.quantity), 0);
  }, [editForm.items]);

  const taxPercentage = settings?.taxPercentage ?? 10;

  const editDiscountAmount = useMemo(() => {
    if (editForm.discountType === 'percentage') {
      return Math.round((editSubtotal * (Number(editForm.discount) || 0)) / 100);
    }
    return Number(editForm.discount) || 0;
  }, [editSubtotal, editForm.discount, editForm.discountType]);

  const editTax = useMemo(() => {
    const taxable = Math.max(0, editSubtotal - editDiscountAmount);
    return Math.round((taxable * taxPercentage) / 100);
  }, [editSubtotal, editDiscountAmount, taxPercentage]);

  const editTotal = useMemo(() => {
    return Math.max(0, editSubtotal - editDiscountAmount + editTax);
  }, [editSubtotal, editDiscountAmount, editTax]);

  const isItemLockedForWaiter = (item: OrderItem) => {
    return isWaiter && Boolean(item.status && ['preparing', 'ready', 'served'].includes(item.status));
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    const item = editForm.items[index];
    if (isItemLockedForWaiter(item)) {
      error('Cannot modify items already being prepared or served in the kitchen.');
      return;
    }
    setEditForm((prev) => {
      const items = [...prev.items];
      if (newQty <= 0) {
        items.splice(index, 1);
      } else {
        items[index] = {
          ...items[index],
          quantity: newQty,
          totalPrice: newQty * items[index].unitPrice,
        };
      }
      return { ...prev, items };
    });
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    if (!canFullEdit) return;
    setEditForm((prev) => {
      const items = [...prev.items];
      const validPrice = Math.max(0, newPrice);
      items[index] = {
        ...items[index],
        unitPrice: validPrice,
        totalPrice: items[index].quantity * validPrice,
      };
      return { ...prev, items };
    });
  };

  const handleRemoveItem = (index: number) => {
    const item = editForm.items[index];
    if (isItemLockedForWaiter(item)) {
      error('Cannot delete items already being prepared or served in the kitchen.');
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleAddMenuItemToOrder = () => {
    if (!selectedMenuItemToAdd) return;
    const menuItem = menuItemDB.getById(selectedMenuItemToAdd);
    if (!menuItem) return;

    const newItem: OrderItem = {
      id: uuidv4(),
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      quantity: 1,
      unitPrice: menuItem.price,
      totalPrice: menuItem.price,
      status: 'pending',
      notes: '',
    };

    setEditForm((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setSelectedMenuItemToAdd('');
  };

  const handleSaveOrderEdit = () => {
    if (!order) return;
    if (editForm.items.length === 0) {
      error('An order must have at least one item.');
      return;
    }

    const tableNum = editForm.tableNumber ? Number(editForm.tableNumber) : undefined;
    let tableId = order.tableId;
    if (tableNum !== undefined) {
      const tbl = tableDB.getAll().find((t) => t.number === tableNum);
      tableId = tbl ? tbl.id : undefined;
    } else {
      tableId = undefined;
    }

    const isNowPaid = editForm.paymentStatus === 'paid';
    const updatedStatus = canFullEdit ? editForm.status : order.status;

    // 1. Update order record
    orderDB.update(order.id, {
      customerName: editForm.customerName.trim(),
      customerPhone: editForm.customerPhone.trim(),
      type: canFullEdit ? editForm.type : order.type,
      tableId: canFullEdit ? tableId : order.tableId,
      tableNumber: canFullEdit ? tableNum : order.tableNumber,
      status: updatedStatus,
      paymentStatus: canFullEdit ? (isNowPaid ? 'paid' : 'pending') : order.paymentStatus,
      isPaid: canFullEdit ? isNowPaid : order.isPaid,
      subtotal: editSubtotal,
      discount: canFullEdit ? editDiscountAmount : order.discount,
      discountType: canFullEdit ? editForm.discountType : order.discountType,
      tax: editTax,
      total: editTotal,
      notes: editForm.notes.trim(),
      items: editForm.items.map((it) => ({
        ...it,
        totalPrice: it.quantity * it.unitPrice,
        status: it.status || 'pending',
      })),
      completedAt: updatedStatus === 'completed' ? order.completedAt || new Date().toISOString() : undefined,
    });

    // 2. Synchronize payment record in memory & Firestore if full edit
    if (canFullEdit) {
      const existingPay = paymentDB.getByOrder(order.id);
      if (isNowPaid) {
        if (existingPay) {
          paymentDB.update(existingPay.id, {
            amount: editTotal,
            method: editForm.paymentMethod,
            status: 'completed',
          });
        } else {
          paymentDB.create({
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount: editTotal,
            method: editForm.paymentMethod,
            status: 'completed',
            receivedBy: userRole || 'Admin',
          });
        }
      } else {
        if (existingPay) {
          paymentDB.delete(existingPay.id);
        }
      }

      // 3. Update table occupancy
      if (updatedStatus === 'completed' || updatedStatus === 'cancelled') {
        if (tableId) {
          tableDB.update(tableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
        }
      } else if (tableId && editForm.type === 'dine-in') {
        tableDB.update(tableId, { status: 'occupied', currentOrderId: order.id });
      }
    }

    success(`Order ${order.orderNumber} updated successfully.`);
    onSaved();
    onClose();
  };

  if (!isOpen || !order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Order #${order.orderNumber}`}
      size="lg"
    >
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        {isWaiter && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700/60 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <ChefHat size={16} className="text-amber-600 shrink-0" />
            <span>
              <strong>Waiter Mode:</strong> You can edit or remove items that are not yet prepared, add new items, or update notes. Items already cooking or served in the kitchen are locked.
            </span>
          </div>
        )}

        {/* Customer & Order Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Customer Name"
            placeholder="Walk-in Customer"
            value={editForm.customerName}
            onChange={(e) => setEditForm((prev) => ({ ...prev, customerName: e.target.value }))}
          />
          <Input
            label="Customer Phone"
            placeholder="090-XXXX-XXXX"
            value={editForm.customerPhone}
            onChange={(e) => setEditForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
          />
          {canFullEdit ? (
            <>
              <Select
                label="Order Type"
                value={editForm.type}
                onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value as any }))}
                options={[
                  { value: 'dine-in', label: 'Dine-In' },
                  { value: 'takeaway', label: 'Takeaway' },
                  { value: 'delivery', label: 'Delivery' },
                ]}
              />
              <Select
                label="Assigned Table"
                value={editForm.tableNumber}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tableNumber: e.target.value }))}
                options={[
                  { value: '', label: 'None / Takeaway' },
                  ...allTables.map((t) => ({ value: String(t.number), label: `Table ${t.number} (${t.capacity} seats)` })),
                ]}
              />
            </>
          ) : (
            <div className="md:col-span-2 flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span><strong>Type:</strong> {order.type}</span>
              <span><strong>Table:</strong> {order.tableNumber ? `Table ${order.tableNumber}` : 'N/A'}</span>
              <span><strong>Status:</strong> <StatusBadge status={order.status} /></span>
            </div>
          )}
        </div>

        {/* Status & Payment Settings (for Admin and Manager) */}
        {canFullEdit && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 p-3.5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Status & Settlement
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select
                label="Lifecycle Status"
                value={editForm.status}
                onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as any }))}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'preparing', label: 'Preparing' },
                  { value: 'ready', label: 'Ready' },
                  { value: 'served', label: 'Served' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
              <Select
                label="Payment Status"
                value={editForm.paymentStatus}
                onChange={(e) => setEditForm((prev) => ({ ...prev, paymentStatus: e.target.value as any }))}
                options={[
                  { value: 'pending', label: '⏳ Unpaid (Pending)' },
                  { value: 'paid', label: '💳 Paid' },
                ]}
              />
              {editForm.paymentStatus === 'paid' ? (
                <Select
                  label="Payment Method"
                  value={editForm.paymentMethod}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, paymentMethod: e.target.value as any }))}
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'card', label: 'Card' },
                    { value: 'upi', label: 'UPI / QR' },
                  ]}
                />
              ) : (
                <div className="flex items-end pb-2 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  <span>Payment will be cleared</span>
                </div>
              )}
            </div>

            {/* Discount control */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <Input
                label="Discount Value"
                type="number"
                min="0"
                value={editForm.discount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discount: Math.max(0, Number(e.target.value)) }))}
              />
              <Select
                label="Discount Type"
                value={editForm.discountType}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discountType: e.target.value as any }))}
                options={[
                  { value: 'percentage', label: 'Percentage (%)' },
                  { value: 'fixed', label: `Fixed Amount (${settings.currencySymbol})` },
                ]}
              />
            </div>
          </div>
        )}

        {/* Order Items Table & Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Order Items ({editForm.items.length})
            </h4>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {editForm.items.length === 0 ? (
              <p className="py-4 text-center text-xs text-red-500 font-semibold">
                No items in order! Please add at least one menu item.
              </p>
            ) : (
              editForm.items.map((item, idx) => {
                const isLocked = isItemLockedForWaiter(item);
                return (
                  <div
                    key={item.id || idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {item.menuItemName}
                        </p>
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] px-2 py-0.5 font-bold">
                            <Lock size={10} /> {item.status === 'served' ? 'Served' : item.status === 'ready' ? 'Ready' : 'In Kitchen'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] px-1.5 py-0.5 font-medium">
                            Pending / Not Prepared
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>Total: {currency(item.quantity * item.unitPrice)}</span>
                        {item.spiceLevel && <span>• 🌶️ {item.spiceLevel}</span>}
                        {item.selectedDrink && <span>• 🥤 {item.selectedDrink}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <label className="text-[10px] text-gray-500 block">Unit Price</label>
                        {canFullEdit ? (
                          <input
                            type="number"
                            min="0"
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-xs font-semibold"
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateItemPrice(idx, Number(e.target.value))}
                          />
                        ) : (
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block py-1">
                            {currency(item.unitPrice)}
                          </span>
                        )}
                      </div>
                      <div className="w-16">
                        <label className="text-[10px] text-gray-500 block">Qty</label>
                        <input
                          type="number"
                          min="1"
                          disabled={isLocked}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-xs font-semibold text-center disabled:opacity-50 disabled:cursor-not-allowed"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItemQty(idx, Number(e.target.value))}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleRemoveItem(idx)}
                        className="mt-3 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isLocked ? 'Cannot remove cooking or served item' : 'Remove item'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Item From Menu */}
          <div className="flex items-end gap-2 pt-1">
            <div className="flex-1">
              <Select
                label="Add Item from Menu"
                value={selectedMenuItemToAdd}
                onChange={(e) => setSelectedMenuItemToAdd(e.target.value)}
                options={[
                  { value: '', label: 'Select menu item to add...' },
                  ...allMenuItems.map((m) => ({
                    value: m.id,
                    label: `${m.name} — ${currency(m.price)}`,
                  })),
                ]}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddMenuItemToOrder}
              disabled={!selectedMenuItemToAdd}
              leftIcon={<Plus size={16} />}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Order Notes */}
        <div>
          <Textarea
            label="Kitchen / Order Notes"
            placeholder="Special preparation instructions..."
            value={editForm.notes}
            onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={2}
          />
        </div>

        {/* Realtime Live Price Summary Breakdown */}
        <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 p-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span>Subtotal:</span>
            <span className="font-semibold">{currency(editSubtotal)}</span>
          </div>
          {editDiscountAmount > 0 && (
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>Discount ({editForm.discountType === 'percentage' ? `${editForm.discount}%` : 'fixed'}):</span>
              <span className="font-semibold">- {currency(editDiscountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-700 dark:text-gray-300">
            <span>Tax ({taxPercentage}%):</span>
            <span className="font-semibold">+ {currency(editTax)}</span>
          </div>
          <div className="flex justify-between text-base font-black text-blue-700 dark:text-blue-300 border-t border-blue-200 dark:border-blue-900/60 pt-2">
            <span>Final Total:</span>
            <span className="text-lg">{currency(editTotal)}</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 font-bold"
            onClick={handleSaveOrderEdit}
            leftIcon={<Save size={16} />}
          >
            Save Record Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function OrdersManagementPage() {
  const tick = useDbUpdate();
  const { success, error } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const isWaiter = user?.role === 'waiter';
  const canEditOrder = isAdmin || isManager;
  const canDeleteOrder = isAdmin;
  const settings = settingsDB.get();

  // Payment Settlement state
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [cashReceived, setCashReceived] = useState<string>('');

  // Record Edit state
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const loadOrders = () => {
    setOrders(orderDB.getAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  useEffect(() => {
    loadOrders();
  }, [tick]);

  const handleDeleteOrderRecord = (order: Order) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete order ${order.orderNumber}?\n\nThis will remove it from both local store and Firestore cloud database, and cascade-delete any associated payment records.`
    );
    if (!confirmed) return;

    orderDB.delete(order.id);
    success(`Order ${order.orderNumber} deleted permanently from database.`);
    loadOrders();
  };

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

    const isPaid = Boolean(order.paymentStatus === 'paid' || order.isPaid || paymentDB.getByOrder(order.id));

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
      if (isPaid) {
        orderDB.update(order.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          items: order.items.map((item) => ({ ...item, status: 'served' })),
        });
        if (order.tableId) {
          tableDB.update(order.tableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
        }
        addNotification('order', 'Order Served & Completed', `${order.orderNumber} is fully served and completed.`);
        success(`${order.orderNumber} marked as served & completed!`);
      } else {
        orderDB.update(order.id, {
          status: 'served',
          items: order.items.map((item) => ({ ...item, status: 'served' })),
        });
        success(`${order.orderNumber} marked as served.`);
      }
    } else if (order.status === 'served' && ['admin', 'manager', 'waiter', 'cashier'].includes(user?.role || '')) {
      // Prompt for payment settlement upon completing order
      setPayingOrder(order);
      setPaymentMethod('cash');
      setCashReceived(String(order.total));
      return;
    }
    loadOrders();
  };

  const handleCompletePayment = () => {
    if (!payingOrder) return;
    if (paymentMethod === 'cash' && Number(cashReceived) < payingOrder.total) {
      error('Cash received is less than total order amount');
      return;
    }

    const servedItems = (payingOrder.items || []).map((item) => ({
      ...item,
      status: (item.status === 'cancelled' ? 'cancelled' : 'served') as const,
    }));

    const updated = orderDB.update(payingOrder.id, {
      status: 'completed',
      items: servedItems,
      paymentStatus: 'paid',
      isPaid: true,
      completedAt: new Date().toISOString(),
    });

    const payRecord = paymentDB.create({
      orderId: payingOrder.id,
      orderNumber: payingOrder.orderNumber,
      amount: payingOrder.total,
      method: paymentMethod,
      status: 'completed',
      receivedBy: user?.username || 'Staff',
    });

    const targetTableId = payingOrder.tableId;
    const targetTableNum = payingOrder.tableNumber;
    if (targetTableId) {
      tableDB.update(targetTableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined, waiterCall: undefined });
    } else if (targetTableNum) {
      const tbl = tableDB.getByNumber(targetTableNum);
      if (tbl) tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined, waiterCall: undefined });
    }
    if (targetTableNum) {
      acknowledgeWaiterCall(targetTableNum, user?.username || 'Staff');
    }

    addNotification('order', 'Payment & Order Completed', `${payingOrder.orderNumber} payment of ${currency(payingOrder.total)} completed.`);
    success(`Payment of ${currency(payingOrder.total)} received & ${payingOrder.orderNumber} completed! Table is now Available.`);

    setPayingOrder(null);
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
        list.map((order) => {
          const payment = paymentDB.getByOrder(order.id);
          const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);

          return (
            <Card key={order.id} className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{order.orderNumber}</h3>
                    <StatusBadge status={order.status} />
                    <Badge variant={order.type === 'dine-in' ? 'primary' : 'success'}>{order.type}</Badge>
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-bold">
                        💳 Paid ({payment?.method?.toUpperCase() || 'PAID'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 px-2.5 py-0.5 text-xs font-bold">
                        ⏳ Unpaid
                      </span>
                    )}
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

              {order.notes && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 p-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <span className="shrink-0 text-sm">🚨</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold">Order Note: </span>
                    <span className="font-medium">{order.notes}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {order.items.map((item) => {
                  const displaySpice = item.spiceLevel;
                  const displayDrink = item.selectedDrink;
                  const displayNotes = item.notes;

                  return (
                    <div key={item.id} className="rounded-lg bg-gray-50/80 p-2 text-xs dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-gray-900 dark:text-white truncate">
                              {item.menuItemName}
                            </span>
                            <span className="rounded bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 px-1 py-0.2 text-[10px] font-black shrink-0">
                              x{item.quantity}
                            </span>
                          </div>
                          
                          {(displaySpice || displayDrink || displayNotes) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                              {displaySpice && (
                                <span className="rounded bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 px-1.5 py-0.2">
                                  🌶️ {displaySpice.split(' - ')[0] || displaySpice}
                                </span>
                              )}
                              {displayDrink && (
                                <span className="rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.2 truncate max-w-[120px]">
                                  🥤 {displayDrink.split(' (')[0] || displayDrink}
                                </span>
                              )}
                              {displayNotes && (
                                <span className="rounded bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 px-1.5 py-0.2 truncate max-w-[150px]">
                                  📝 {displayNotes}
                                </span>
                              )}
                            </div>
                          )}

                          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            {currency(item.unitPrice * item.quantity)}
                          </p>
                        </div>
                        <StatusBadge status={item.status} showDot={false} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex flex-wrap items-center gap-2">
                  {order.status !== 'served' && canAdvanceOrder(user?.role, order.status) && (
                    <Button
                      size="sm"
                      onClick={() => advanceOrder(order)}
                      leftIcon={<CheckCircle2 size={14} />}
                      className="font-bold"
                    >
                      {getOrderAdvanceLabel(user?.role, order.status)}
                    </Button>
                  )}
                  {!isPaid && ['admin', 'manager', 'waiter', 'cashier'].includes(user?.role || '') && !['completed', 'cancelled'].includes(order.status) && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      onClick={() => {
                        setPayingOrder(order);
                        setPaymentMethod('cash');
                        setCashReceived(String(order.total));
                      }}
                      leftIcon={<CreditCard size={14} />}
                    >
                      {order.status === 'served' ? `Pay & Settle (${currency(order.total)})` : 'Settle Payment'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => printInvoice(order, payment)} leftIcon={<Printer size={14} />}>
                    Print Invoice
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadThermalReceiptPdf(order, payment)} leftIcon={<FileDown size={14} />} title="Download 80mm Thermal Receipt PDF">
                    PDF
                  </Button>
                </div>

                {/* Secondary Administrative Actions */}
                <div className="flex items-center gap-1.5">
                  {canEditOrder && (
                    <button
                      type="button"
                      onClick={() => setEditingOrder(order)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      title="Edit Order Record"
                    >
                      <Edit size={13} />
                      <span>Edit</span>
                    </button>
                  )}
                  {isWaiter &&
                    !['completed', 'cancelled'].includes(order.status) &&
                    order.items.some((i) => !i.status || i.status === 'pending') && (
                    <button
                      type="button"
                      onClick={() => setEditingOrder(order)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-700/60 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                      title="Edit Placed Items"
                    >
                      <Edit size={13} />
                      <span>Edit Items</span>
                    </button>
                  )}
                  {canCancelOrder(user?.role) && !['completed', 'cancelled'].includes(order.status) && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(order)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Cancel Order"
                    >
                      <X size={13} />
                      <span>Cancel</span>
                    </button>
                  )}
                  {canDeleteOrder && (
                    <button
                      type="button"
                      onClick={() => handleDeleteOrderRecord(order)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Delete Order Permanently"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<Receipt size={14} />} label="Active Orders" value={activeOrders.length} color="yellow" />
            <StatChip icon={<CheckCircle2 size={14} />} label="Completed" value={completedOrders.length} color="green" />
            <StatChip icon={<Receipt size={14} />} label="Revenue" value={currency(completedOrders.reduce((sum, order) => sum + order.total, 0))} color="blue" />
          </>
        }
        action={
          <Button size="sm" variant="outline" onClick={loadOrders} leftIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      />

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

      {/* Payment Settlement Modal */}
      {payingOrder && (
        <Modal
          isOpen={!!payingOrder}
          onClose={() => setPayingOrder(null)}
          title={`Process Payment: ${payingOrder.orderNumber}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/80 p-4 border border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Order:</span>
                <span className="font-bold text-gray-900 dark:text-white">{payingOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Table / Type:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {payingOrder.tableNumber ? `Table ${payingOrder.tableNumber}` : 'Takeaway'} ({payingOrder.type})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Customer:</span>
                <span className="font-medium text-gray-900 dark:text-white">{payingOrder.customerName || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between text-base font-black border-t border-gray-200 dark:border-gray-700 pt-2 text-gray-900 dark:text-white">
                <span>Total Amount Due:</span>
                <span className="text-blue-600 dark:text-blue-400 text-lg">{currency(payingOrder.total)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Select Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Cash', icon: <Banknote size={16} /> },
                  { id: 'card', label: 'Card', icon: <CreditCard size={16} /> },
                  { id: 'upi', label: 'UPI / QR', icon: <Smartphone size={16} /> },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-2 text-xs font-bold border transition-all cursor-pointer',
                      paymentMethod === m.id
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                    )}
                  >
                    {m.icon}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered Input & Change */}
            {paymentMethod === 'cash' && (
              <div className="space-y-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-900/40">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Cash Received
                  </label>
                  <Input
                    type="number"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="Enter cash received amount"
                    autoFocus
                  />
                </div>
                {Number(cashReceived) >= payingOrder.total && (
                  <div className="flex justify-between text-xs font-black text-green-700 dark:text-green-300 pt-1">
                    <span>Change Due:</span>
                    <span>{currency(Number(cashReceived) - payingOrder.total)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPayingOrder(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={handleCompletePayment}
                leftIcon={<CheckCircle2 size={16} />}
              >
                Complete Payment
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Order Modal */}
      <EditOrderModal
        order={editingOrder}
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        onSaved={loadOrders}
        userRole={user?.role}
      />
    </div>
  );
}

export function KitchenDisplayPage() {
  const tick = useDbUpdate();
  const { success } = useToast();
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  const refresh = () => {
    const activeKitchenOrders = orderDB
      .getAll()
      .filter((order) => order.status !== 'cancelled' && order.status !== 'completed' && ['active', 'preparing', 'ready'].includes(order.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setOrders(activeKitchenOrders);
  };

  useEffect(() => {
    refresh();
  }, [tick]);

  useEffect(() => {
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
    const allServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served');
    const allReadyOrServed = nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'ready' || i.status === 'served');
    const anyPreparingOrReady = nonCancelled.some((i) => i.status === 'preparing' || i.status === 'ready' || i.status === 'served');

    const isPaid = Boolean(order.paymentStatus === 'paid' || order.isPaid || paymentDB.getByOrder(order.id));

    if (allServed) {
      if (isPaid) {
        orderDB.update(order.id, { items: updatedItems, status: 'completed', completedAt: new Date().toISOString() });
        if (order.tableId) {
          tableDB.update(order.tableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
        }
        addNotification('order', 'Order Completed', `${order.orderNumber} is fully served & completed.`);
        success(`${order.orderNumber} fully served & completed!`);
      } else {
        orderDB.update(order.id, { items: updatedItems, status: 'served' });
        addNotification('order', 'Order Served', `${order.orderNumber} is served (Awaiting payment).`);
        success(`${order.orderNumber} marked as served.`);
      }
    } else {
      let computedOrderStatus: Order['status'] = 'active';
      if (allReadyOrServed) {
        computedOrderStatus = 'ready';
      } else if (anyPreparingOrReady) {
        computedOrderStatus = 'preparing';
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
      }
    }

    refresh();
  };

  const updateStatus = (order: Order) => {
    const isPaid = Boolean(order.paymentStatus === 'paid' || order.isPaid || paymentDB.getByOrder(order.id));

    if (order.status === 'active') {
      orderDB.update(order.id, { status: 'preparing', items: order.items.map((item) => ({ ...item, status: 'preparing' })) });
      addNotification('order', 'Cooking Started', `${order.orderNumber} has started in kitchen.`);
      success(`${order.orderNumber} is now preparing.`);
    } else if (order.status === 'preparing') {
      orderDB.update(order.id, { status: 'ready', items: order.items.map((item) => ({ ...item, status: 'ready' })) });
      addNotification('order', 'Food Ready', `${order.orderNumber} is ready for pickup/serving.`);
      success(`${order.orderNumber} is ready.`);
    } else if (order.status === 'ready') {
      if (isPaid) {
        orderDB.update(order.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          items: order.items.map((item) => ({ ...item, status: 'served' })),
        });
        if (order.tableId) {
          tableDB.update(order.tableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
        }
        addNotification('order', 'Order Served & Completed', `${order.orderNumber} is fully served & completed.`);
        success(`${order.orderNumber} fully served & completed!`);
      } else {
        orderDB.update(order.id, { status: 'served', items: order.items.map((item) => ({ ...item, status: 'served' })) });
        addNotification('order', 'Order Served', `${order.orderNumber} has been marked served from the kitchen board.`);
        success(`${order.orderNumber} marked as served.`);
      }
    }
    refresh();
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<Receipt size={14} />} label="Queued" value={orders.filter((order) => order.status === 'active').length} color="yellow" />
            <StatChip icon={<ChefHat size={14} />} label="Cooking" value={orders.filter((order) => order.status === 'preparing').length} color="blue" />
            <StatChip icon={<CheckCircle2 size={14} />} label="Ready" value={orders.filter((order) => order.status === 'ready').length} color="green" />
          </>
        }
        action={
          <Button size="sm" variant="outline" onClick={refresh} leftIcon={<RefreshCw size={14} />}>
            Refresh Board
          </Button>
        }
      />

      {orders.length === 0 ? (
        <Card className="py-16 text-center text-gray-500 dark:text-gray-400">
          No kitchen orders waiting right now.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const payment = paymentDB.getByOrder(order.id);
            const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);
            const minutesWaiting = Math.max(1, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000));

            return (
              <Card key={order.id} padding="sm" className={cn('space-y-3 border-l-4 transition-all', order.status === 'active' && 'border-l-amber-500', order.status === 'preparing' && 'border-l-blue-500', order.status === 'ready' && 'border-l-emerald-500')}>
                {/* Ticket Header: Table number, order number, waiting timer, status */}
                <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-gray-900 dark:text-white">
                        {order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway'}
                      </span>
                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                        #{order.orderNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500">
                        {order.type}
                      </span>
                      {isPaid ? (
                        <span className="inline-flex items-center rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-bold">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 text-[10px] font-bold">
                          Unpaid
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={order.status} />
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold',
                      minutesWaiting >= 20
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse'
                        : minutesWaiting >= 10
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    )}>
                      ⏱️ {minutesWaiting}m
                    </span>
                  </div>
                </div>

                {/* Entire Order Notes Banner */}
                {order.notes && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 p-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <span className="text-sm shrink-0">🚨</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold">Note: </span>
                      <span className="font-medium">{order.notes}</span>
                    </div>
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-1.5">
                  {order.items.map((item) => {
                    const itemStatus = item.status || 'pending';
                    const displaySpice = item.spiceLevel;
                    const displayDrink = item.selectedDrink;
                    const displayNotes = item.notes;

                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50/80 p-2 text-xs dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-black text-white shrink-0">
                              x{item.quantity}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-white truncate text-sm">
                              {item.menuItemName}
                            </span>
                          </div>

                          {(displaySpice || displayDrink || displayNotes) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
                              {displaySpice && (
                                <span className="rounded bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 px-1.5 py-0.2">
                                  🌶️ {displaySpice.split(' - ')[0] || displaySpice}
                                </span>
                              )}
                              {displayDrink && (
                                <span className="rounded bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.2 truncate max-w-[120px]">
                                  🥤 {displayDrink.split(' (')[0] || displayDrink}
                                </span>
                              )}
                              {displayNotes && (
                                <span className="rounded bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 px-1.5 py-0.2 truncate max-w-[150px]">
                                  📝 {displayNotes}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            value={itemStatus}
                            onChange={(e) => updateItemStatus(order, item.id, e.target.value as OrderItem['status'])}
                            className={cn(
                              'rounded-md border px-1.5 py-0.5 text-[11px] font-semibold focus:outline-none focus:ring-1',
                              ((itemStatus as string) === 'pending' || (itemStatus as string) === 'active') && 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                              itemStatus === 'preparing' && 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                              itemStatus === 'ready' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
                              itemStatus === 'served' && 'border-gray-300 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
                              itemStatus === 'cancelled' && 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                            )}
                          >
                            <option value="pending">Pending</option>
                            <option value="preparing">Prep</option>
                            <option value="ready">Ready</option>
                            <option value="served">Served</option>
                          </select>

                          {itemStatus === 'preparing' ? (
                            <button
                              type="button"
                              onClick={() => updateItemStatus(order, item.id, 'ready')}
                              className="flex items-center gap-0.5 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                              title="Mark item ready"
                            >
                              <CheckCircle2 size={12} />
                              Ready
                            </button>
                          ) : ((itemStatus as string) === 'pending' || (itemStatus as string) === 'active') ? (
                            <button
                              type="button"
                              onClick={() => updateItemStatus(order, item.id, 'preparing')}
                              className="flex items-center gap-0.5 rounded-md bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
                              title="Start preparing item"
                            >
                              <ChefHat size={12} />
                              Prep
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ticket Footer Action Bar */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <Button variant="outline" size="sm" onClick={() => printInvoice(order, payment)} leftIcon={<Printer size={14} />} title="Print Kitchen Ticket">
                    Print Ticket
                  </Button>
                  {canAdvanceOrder(user?.role, order.status) && (
                    <Button className="flex-1 font-bold text-xs" size="sm" onClick={() => updateStatus(order)} leftIcon={<ChefHat size={14} />}>
                      {getOrderAdvanceLabel(user?.role, order.status)}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TableManagementPage() {
  const tick = useDbUpdate();
  const { success, error } = useToast();
  const { notifications, markAsRead } = useNotifications();
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
  }, [tick]);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canManageTableStructure = isAdmin || isManager;
  const canClearOrClean = ['admin', 'manager', 'waiter'].includes(user?.role || '');

  const openTableModal = (table?: Table) => {
    if (!canManageTableStructure) {
      error('Only managers and admins can add or edit tables.');
      return;
    }
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
    if (!canManageTableStructure) {
      error('Only managers and admins can add or edit tables.');
      return;
    }
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
    tableDB.update(table.id, { status: 'available', reservationInfo: undefined, waiterCall: undefined });
    acknowledgeWaiterCall(table.number, user?.username);
    success(`Reservation cleared for Table ${table.number}.`);
    loadTables();
  };

  const deleteTable = (table: Table) => {
    if (!canManageTableStructure) {
      error('Only managers and admins can delete tables.');
      return;
    }
    const activeOrder = table.currentOrderId ? orderDB.getById(table.currentOrderId) : null;
    if (activeOrder && !['completed', 'cancelled'].includes(activeOrder.status)) {
      if (
        !window.confirm(
          `Table ${table.number} has active order #${activeOrder.orderNumber}. Are you sure you want to delete this table?`
        )
      ) {
        return;
      }
    } else {
      if (!window.confirm(`Delete Table ${table.number}?`)) return;
    }
    tableDB.delete(table.id);
    success(`Table ${table.number} deleted.`);
    loadTables();
  };

  const markTableCleaning = (table: Table, activeOrder?: Order | null) => {
    if (!canClearOrClean) return;
    const isPaid = activeOrder
      ? Boolean(activeOrder.paymentStatus === 'paid' || activeOrder.isPaid || paymentDB.getByOrder(activeOrder.id))
      : true;
    const nonCancelled = activeOrder?.items.filter((i) => i.status !== 'cancelled') || [];
    const isServed = activeOrder
      ? activeOrder.status === 'served' || (nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served'))
      : true;

    if (activeOrder && (!isPaid || !isServed)) {
      if (user?.role === 'waiter') {
        error(`Table ${table.number} can only be cleaned after order #${activeOrder.orderNumber} is fully served and paid.`);
        return;
      }
      if (
        !window.confirm(
          `Order #${activeOrder.orderNumber} for Table ${table.number} is not yet fully served and paid. Mark table as Cleaning anyway?`
        )
      ) {
        return;
      }
    }
    tableDB.update(table.id, { status: 'cleaning', currentOrderId: undefined, waiterCall: undefined });
    acknowledgeWaiterCall(table.number, user?.username);
    success(`Table ${table.number} marked for Cleaning.`);
    loadTables();
  };

  const markTableReady = (table: Table) => {
    if (!canClearOrClean) return;
    const activeOrder = table.currentOrderId
      ? orderDB.getById(table.currentOrderId)
      : orderDB
          .getAll()
          .find(
            (o) =>
              (o.tableId === table.id || o.tableNumber === table.number) &&
              !['completed', 'cancelled'].includes(o.status)
          );

    if (activeOrder) {
      const isPaid = Boolean(activeOrder.paymentStatus === 'paid' || activeOrder.isPaid || paymentDB.getByOrder(activeOrder.id));
      const nonCancelled = activeOrder.items.filter((i) => i.status !== 'cancelled');
      const isServed = activeOrder.status === 'served' || (nonCancelled.length > 0 && nonCancelled.every((i) => i.status === 'served'));

      if (!isServed || !isPaid) {
        error(
          `Table ${table.number} cannot be cleared: Order #${activeOrder.orderNumber} must be fully served and paid first.`
        );
        return;
      }
      orderDB.update(activeOrder.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        items: activeOrder.items.map((i) => ({ ...i, status: 'served' })),
      });
    }

    tableDB.update(table.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined, waiterCall: undefined });
    acknowledgeWaiterCall(table.number, user?.username);
    success(`Table ${table.number} cleared and is now Ready & Available.`);
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
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<CheckCircle2 size={14} />} label="Available" value={stats.available} color="green" />
            <StatChip icon={<Users size={14} />} label="Occupied" value={stats.occupied} color="red" />
            <StatChip icon={<Receipt size={14} />} label="Reserved" value={stats.reserved} color="yellow" />
            <StatChip icon={<RefreshCw size={14} />} label="Cleaning" value={stats.cleaning} color="purple" />
          </>
        }
        action={canManageTableStructure ? <Button size="sm" onClick={() => openTableModal()} leftIcon={<Plus size={14} />}>Add Table</Button> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tables.map((table) => {
          const activeOrder = table.currentOrderId
            ? orderDB.getById(table.currentOrderId)
            : orderDB
                .getAll()
                .find(
                  (o) =>
                    (o.tableId === table.id || o.tableNumber === table.number) &&
                    !['completed', 'cancelled'].includes(o.status)
                );

          const isPaid = activeOrder
            ? Boolean(activeOrder.paymentStatus === 'paid' || activeOrder.isPaid || paymentDB.getByOrder(activeOrder.id))
            : true;

          const nonCancelledItems = activeOrder?.items.filter((i) => i.status !== 'cancelled') || [];
          const isServed = activeOrder
            ? Boolean(activeOrder.status === 'served' || (nonCancelledItems.length > 0 && nonCancelledItems.every((i) => i.status === 'served')))
            : true;

          const canClearCurrentTable = !activeOrder || (isServed && isPaid);

          return (
            <Card key={table.id} padding="sm" className="flex flex-col justify-between space-y-3 transition-shadow hover:shadow-md">
              <div className="space-y-2">
                {/* Top Row: Table number, capacity badge, and quick action icons */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg font-black text-gray-900 dark:text-white">
                      Table {table.number}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {table.capacity}p • F{table.floor}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <StatusBadge status={table.status} />
                    <button
                      type="button"
                      onClick={() => {
                        setQrTableNumber(table.number);
                        setShowQRModal(true);
                      }}
                      className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                      title="View Table QR Code"
                    >
                      <QrCode size={14} />
                    </button>
                    {canManageTableStructure && (
                      <button
                        type="button"
                        onClick={() => openTableModal(table)}
                        className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        title="Edit Table"
                      >
                        <Edit size={13} />
                      </button>
                    )}
                    {canManageTableStructure && table.status !== 'occupied' && (
                      <button
                        type="button"
                        onClick={() => deleteTable(table)}
                        className="p-1 rounded text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete Table"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Reservation Info */}
                {table.reservationInfo && (
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900/50 p-2 text-xs text-yellow-900 dark:text-yellow-200">
                    <p className="font-bold truncate">{table.reservationInfo.customerName}</p>
                    <p className="text-[10px] text-yellow-800 dark:text-yellow-300">
                      {table.reservationInfo.partySize} guests • {format(new Date(table.reservationInfo.reservationTime), 'p')}
                    </p>
                  </div>
                )}

                {/* Occupied but no active order warning */}
                {table.status === 'occupied' && !activeOrder && (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2 text-xs text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900/60 flex items-center justify-between">
                    <span>Occupied (No Order)</span>
                    {canClearOrClean && (
                      <button
                        onClick={() => markTableReady(table)}
                        className="rounded bg-rose-600 px-2 py-0.5 text-white text-[10px] font-bold hover:bg-rose-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {/* Active Order Preview */}
                {activeOrder && (
                  <div className="rounded-lg bg-blue-50/70 dark:bg-blue-950/30 p-2 text-xs text-blue-950 dark:text-blue-100 flex items-center justify-between border border-blue-200/80 dark:border-blue-900/50">
                    <div className="min-w-0">
                      <span className="font-bold">#{activeOrder.orderNumber}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 block">
                        {currency(activeOrder.total)} • {activeOrder.items.length} items
                      </span>
                    </div>
                    {isPaid ? (
                      <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300">
                        Paid
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                        Unpaid
                      </span>
                    )}
                  </div>
                )}

                {/* Active Waiter Call Alert */}
                {(() => {
                  const isFreshCall = (t?: number | string) => {
                    if (!t) return false;
                    const timeMs = typeof t === 'number' ? t : new Date(t).getTime();
                    return !isNaN(timeMs) && Date.now() - timeMs < 3 * 60 * 1000;
                  };

                  const hasActiveWaiterCall =
                    (table.waiterCall?.active && isFreshCall(table.waiterCall.timestamp)) ||
                    notifications.some(
                      (n) =>
                        !n.isRead &&
                        n.type === 'table' &&
                        (n.tableNumber === table.number || n.title.includes(`Table ${table.number}`)) &&
                        isFreshCall(n.createdAt)
                    );

                  if (!hasActiveWaiterCall) return null;

                  return (
                    <div className="rounded-lg bg-amber-500 text-white p-2 text-xs font-bold flex items-center justify-between shadow-xs animate-pulse">
                      <div className="flex items-center gap-1 min-w-0">
                        <BellRing size={13} className="shrink-0 animate-bounce" />
                        <span className="truncate text-[11px]">Waiter Calling!</span>
                      </div>
                      <button
                        onClick={() => acknowledgeWaiterCall(table.number, user?.username)}
                        className="ml-1 shrink-0 rounded bg-white text-amber-900 px-1.5 py-0.5 text-[10px] font-black cursor-pointer shadow-xs"
                      >
                        Dismiss
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Bottom Actions Row: 1 Primary CTA + Inline Secondary Utility Buttons */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5">
                {table.status === 'available' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-semibold py-1"
                    onClick={() => {
                      setSelectedTable(table);
                      setReservationForm({
                        customerName: '',
                        customerPhone: '',
                        reservationTime: '',
                        partySize: String(table.capacity),
                      });
                      setShowReserveModal(true);
                    }}
                  >
                    Reserve Table
                  </Button>
                )}

                {table.status === 'reserved' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs font-semibold py-1"
                    onClick={() => clearReservation(table)}
                  >
                    Clear Reservation
                  </Button>
                )}

                {table.status === 'cleaning' && canClearOrClean && (
                  <Button
                    variant="success"
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1"
                    onClick={() => markTableReady(table)}
                    leftIcon={<CheckCircle2 size={13} />}
                  >
                    Mark Ready
                  </Button>
                )}

                {table.status === 'occupied' && (
                  <>
                    {canClearOrClean && (
                      canClearCurrentTable || canManageTableStructure ? (
                        <Button
                          variant="success"
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1"
                          onClick={() => markTableReady(table)}
                          leftIcon={<CheckCircle2 size={13} />}
                        >
                          Clear
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="flex-1 opacity-40 cursor-not-allowed font-medium text-[10px] py-1 border-gray-300 dark:border-gray-700 text-gray-400"
                          title="Table can only be cleared after order is fully served and paid."
                        >
                          {!isServed ? 'Not Served' : 'Unpaid'}
                        </Button>
                      )
                    )}
                    {canClearOrClean && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="py-1 px-2 text-xs border-purple-400 text-purple-600 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40"
                        onClick={() => markTableCleaning(table, activeOrder)}
                        title="Mark for Cleaning"
                      >
                        <RefreshCw size={13} />
                      </Button>
                    )}
                    {activeOrder && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="py-1 px-2 text-xs"
                        onClick={() => moveOrder(table)}
                        title="Move Order to Another Table"
                      >
                        <ArrowRightLeft size={13} />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal isOpen={showTableModal && canManageTableStructure} onClose={() => setShowTableModal(false)} title={editingTable ? 'Edit Table' : 'Add Table'}>
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
  const tick = useDbUpdate();
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
  const hasWarnedLowStock = useRef(false);

  const loadData = () => {
    const inventory = inventoryDB.getAll();
    setItems(inventory);
    setSuppliers(supplierDB.getAll());
    setPurchases(purchaseDB.getAll().sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()));

    const lowStock = inventory.filter((item) => item.isActive && item.quantity <= item.minQuantity);
    if (!hasWarnedLowStock.current && lowStock.length > 0) {
      warning(`${lowStock.length} inventory item(s) are low in stock.`);
      hasWarnedLowStock.current = true;
    }
  };

  useEffect(() => {
    loadData();
  }, [tick]);

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
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<PackagePlus size={14} />} label="Items" value={items.length} color="blue" />
            <StatChip icon={<AlertTriangle size={14} />} label="Low Stock" value={lowStockItems.length} color="yellow" />
            <StatChip icon={<Truck size={14} />} label="Suppliers" value={items.filter((item) => item.supplierId).length} color="purple" />
            <StatChip icon={<Receipt size={14} />} label="Total Value" value={currency(inventoryValue)} color="green" />
          </>
        }
        action={canManageInventoryModule ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openPurchaseModal()} leftIcon={<PackagePlus size={14} />}>
              Add Purchase
            </Button>
            <Button size="sm" onClick={() => openItemModal()} leftIcon={<Plus size={14} />}>
              Add Item
            </Button>
          </div>
        ) : undefined}
      />

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
  const tick = useDbUpdate();
  const { success, error } = useToast();
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', gstNumber: '', isActive: true });

  const loadSuppliers = () => setSuppliers(supplierDB.getAll());

  useEffect(() => {
    loadSuppliers();
  }, [tick]);

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
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<Truck size={14} />} label="Suppliers" value={suppliers.length} color="blue" />
            <StatChip icon={<CheckCircle2 size={14} />} label="Active" value={suppliers.filter((supplier) => supplier.isActive).length} color="green" />
            <StatChip icon={<AlertTriangle size={14} />} label="Inactive" value={suppliers.filter((supplier) => !supplier.isActive).length} color="yellow" />
          </>
        }
        action={canManageSupplierRecords ? <Button size="sm" onClick={() => openModal()} leftIcon={<Plus size={14} />}>Add Supplier</Button> : undefined}
      />

      <DataTable
        columns={[
          {
            key: 'name',
            header: 'Supplier',
            render: (supplier) => (
              <div>
                <p className="font-medium">{supplier.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Tax ID: {supplier.gstNumber || '—'}</p>
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
          <Input label="Tax ID / Registration No." placeholder="e.g. GSTIN, Tax ID, or VAT number" value={form.gstNumber} onChange={(e) => setForm((prev) => ({ ...prev, gstNumber: e.target.value }))} />
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
  const tick = useDbUpdate();
  const { success, error } = useToast();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'waiter' as UserRole, salary: '0', shift: 'morning', joiningDate: new Date().toISOString().split('T')[0], isActive: true, address: '' });

  const loadEmployees = () => setEmployees(employeeDB.getAll());

  useEffect(() => {
    loadEmployees();
  }, [tick]);

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
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<Users size={14} />} label="Staff" value={employees.length} color="blue" />
            <StatChip icon={<CheckCircle2 size={14} />} label="Active" value={employees.filter((employee) => employee.isActive).length} color="green" />
            <StatChip icon={<UserCog size={14} />} label="Managers" value={employees.filter((employee) => ['manager', 'admin'].includes(employee.role)).length} color="purple" />
            <StatChip icon={<Receipt size={14} />} label="Payroll" value={currency(totalSalary)} color="yellow" />
          </>
        }
        action={canManageEmployeeModule ? <Button size="sm" onClick={() => openModal()} leftIcon={<Plus size={14} />}>Add Employee</Button> : undefined}
      />

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
  const tick = useDbUpdate();
  const { success } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canEditOrder = isAdmin || isManager;
  const canDeleteOrder = isAdmin;
  const settings = settingsDB.get();
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [refreshKey, setRefreshKey] = useState(0);

  const orders = useMemo(() => orderDB.getByDateRange(startDate, endDate), [startDate, endDate, refreshKey, tick]);
  const payments = useMemo(() => paymentDB.getAll().filter((payment) => {
    const day = payment.createdAt.split('T')[0];
    return day >= startDate && day <= endDate;
  }), [startDate, endDate, refreshKey, tick]);
  const weeklySales = useMemo(() => analyticsDB.getWeeklySales(), [refreshKey, tick]);
  const monthlySales = useMemo(() => analyticsDB.getMonthlySales(), [refreshKey, tick]);
  const bestSelling = useMemo(() => analyticsDB.getBestSellingItems(6), [refreshKey, tick]);

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
    <div className="space-y-4">
      <Card padding="sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-900 dark:text-white"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)}>
              Apply Range
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-auto">
            <Button size="sm" variant="outline" onClick={() => setRefreshKey((value) => value + 1)} leftIcon={<RefreshCw size={14} />}>
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} leftIcon={<Download size={14} />}>
              Export CSV
            </Button>
            <Button size="sm" onClick={exportPdf} leftIcon={<FileDown size={14} />}>
              Export PDF
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
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => printInvoice(order)} leftIcon={<Printer size={14} />}>
                  Invoice
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadThermalReceiptPdf(order)} leftIcon={<FileDown size={14} />} title="Download 80mm Thermal Receipt PDF">
                  PDF
                </Button>
                {canEditOrder && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/40 font-medium"
                    onClick={() => setEditingOrder(order)}
                    leftIcon={<Edit size={14} />}
                  >
                    Edit
                  </Button>
                )}
                {canDeleteOrder && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete order ${order.orderNumber}?\n\nThis will remove it from the cloud database and cascade-delete associated payments.`
                        )
                      ) {
                        orderDB.delete(order.id);
                        setRefreshKey((v) => v + 1);
                        success(`Order ${order.orderNumber} deleted permanently.`);
                      }
                    }}
                    leftIcon={<Trash2 size={14} />}
                  >
                    Delete
                  </Button>
                )}
              </div>
            ),
          },
        ]}
        data={orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
        keyExtractor={(order) => order.id}
        emptyMessage="No orders found in selected range"
      />

      {/* Edit Order Modal */}
      <EditOrderModal
        order={editingOrder}
        isOpen={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        onSaved={() => setRefreshKey((v) => v + 1)}
        userRole={user?.role}
      />
    </div>
  );
}

export function SettingsPage() {
  const tick = useDbUpdate();
  const { success, error, info } = useToast();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [form, setForm] = useState<AppSettings>(() => settingsDB.get());
  const [isImporting, setIsImporting] = useState(false);

  // Dynamic regional Tax and Rate labels based on currency setting
  const taxLabel = useMemo(() => {
    switch (form.currency) {
      case 'INR':
        return 'GST / Tax ID Number';
      case 'USD':
        return 'Tax ID / EIN Number';
      case 'EUR':
      case 'GBP':
        return 'VAT Registration Number';
      case 'JPY':
        return 'Invoice Reg. No. (適格請求書登録番号)';
      case 'NPR':
        return 'PAN / VAT Number';
      default:
        return 'Tax ID / Business Registration No.';
    }
  }, [form.currency]);

  const taxPercentageLabel = useMemo(() => {
    switch (form.currency) {
      case 'INR':
        return 'GST Rate (%)';
      case 'USD':
        return 'Sales Tax (%)';
      case 'EUR':
      case 'GBP':
        return 'VAT Rate (%)';
      case 'JPY':
        return 'Consumption Tax (%)';
      default:
        return 'Tax Percentage (%)';
    }
  }, [form.currency]);

  // Sync form when database updates externally (e.g. from Cloud sync or other tabs)
  useEffect(() => {
    const latest = settingsDB.get();
    setForm((prev) => ({
      ...latest,
      restaurantLogo: latest.restaurantLogo || '',
    }));
  }, [tick]);

  // Firebase Configuration State
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseConfig>(() => {
    return (
      getStoredFirebaseConfig() || {
        apiKey: '',
        authDomain: '',
        projectId: '',
        appId: '',
        storageBucket: '',
        messagingSenderId: '',
        databaseURL: '',
      }
    );
  });
  const [rawFirebaseJson, setRawFirebaseJson] = useState('');
  const [cloudState, setCloudState] = useState<FirebaseConnectionState>(() => getFirebaseConnectionState());
  const [isUploadingToCloud, setIsUploadingToCloud] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  useEffect(() => {
    const unsub = subscribeFirebaseStatus((state) => {
      setCloudState(state);
    });

    if (hasStoredFirebaseConfig()) {
      checkFirebaseHealth();
    }

    return () => {
      unsub();
    };
  }, []);

  const handleSaveFirebaseConfig = async () => {
    let current = { ...firebaseConfig };
    if (rawFirebaseJson.trim()) {
      const extracted = parseFirebaseConfigSnippet(rawFirebaseJson);
      current = {
        apiKey: (extracted.apiKey || current.apiKey || '').trim(),
        authDomain: (extracted.authDomain || current.authDomain || '').trim(),
        projectId: (extracted.projectId || current.projectId || '').trim(),
        appId: (extracted.appId || current.appId || '').trim(),
        storageBucket: (extracted.storageBucket || current.storageBucket || '').trim(),
        messagingSenderId: (extracted.messagingSenderId || current.messagingSenderId || '').trim(),
        databaseURL: (extracted.databaseURL || current.databaseURL || '').trim(),
      };
      setFirebaseConfig(current);
    }

    if (!current.apiKey.trim() || !current.projectId.trim()) {
      error('Please enter at least your Firebase API Key and Project ID.');
      return;
    }

    setIsTestingConnection(true);
    try {
      const configToSave: FirebaseConfig = {
        apiKey: current.apiKey.trim(),
        authDomain: current.authDomain.trim() || `${current.projectId.trim()}.firebaseapp.com`,
        projectId: current.projectId.trim(),
        appId: current.appId.trim(),
        storageBucket: current.storageBucket?.trim() || `${current.projectId.trim()}.appspot.com`,
        messagingSenderId: current.messagingSenderId?.trim() || '',
        databaseURL: current.databaseURL?.trim() || '',
      };

      const testResult = await testFirebaseConnection(configToSave);
      if (testResult.success) {
        saveStoredFirebaseConfig(configToSave);
        initFirebase(configToSave);
        firebaseSync.start();
        success('Cloud connection established successfully!');
      } else {
        error(testResult.message || 'Firebase connection failed.');
      }
    } catch {
      error('Failed to connect to Firebase.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestOnlyConnection = async () => {
    setIsTestingConnection(true);
    try {
      const current = { ...firebaseConfig };
      const configToTest: FirebaseConfig = {
        apiKey: current.apiKey.trim(),
        authDomain: current.authDomain.trim() || `${current.projectId.trim()}.firebaseapp.com`,
        projectId: current.projectId.trim(),
        appId: current.appId.trim(),
        storageBucket: current.storageBucket?.trim() || `${current.projectId.trim()}.appspot.com`,
        messagingSenderId: current.messagingSenderId?.trim() || '',
        databaseURL: current.databaseURL?.trim() || '',
      };

      const res = await testFirebaseConnection(configToTest);
      if (res.success) {
        success(res.message || 'Firebase project is reachable and healthy!');
      } else {
        error(res.message || 'Firebase connection failed.');
      }
    } catch {
      error('Error during connection test.');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDisconnectFirebase = () => {
    resetFirebaseApp();
    setFirebaseConfig({
      apiKey: '',
      authDomain: '',
      projectId: '',
      appId: '',
      storageBucket: '',
      messagingSenderId: '',
      databaseURL: '',
    });
    setRawFirebaseJson('');
    info('Firebase disconnected. System running in offline-first mode.');
  };

  const handleUploadAllToCloud = async () => {
    if (!isFirebaseActive()) {
      error('Firebase is not active. Connect to cloud before uploading.');
      return;
    }
    setIsUploadingToCloud(true);
    try {
      const res = await firebaseSync.pushAllLocalDataToCloud();
      if (res.success) {
        success('Local database successfully synchronized to Firebase Cloud Firestore!');
      } else {
        error(res.message || 'Cloud synchronization encountered errors.');
      }
    } catch (err: any) {
      error(`Cloud sync failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsUploadingToCloud(false);
    }
  };

  const handlePasteFirebaseJson = (val: string) => {
    setRawFirebaseJson(val);
    const parsed = parseFirebaseConfigSnippet(val);
    if (parsed.apiKey || parsed.projectId) {
      setFirebaseConfig((prev) => ({
        ...prev,
        ...parsed,
      }));
      success('Parsed Firebase configuration snippet successfully!');
    }
  };

  const saveSettings = () => {
    settingsDB.update(form);
    setTheme(form.theme);
    setLanguage(form.language);
    success(t('saved', 'Settings saved successfully.'));
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      error('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      error('Image file is too large. Please choose an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      // Compress and resize image using Canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/png');
          setForm((prev) => ({ ...prev, restaurantLogo: compressedDataUrl }));
          settingsDB.update({ restaurantLogo: compressedDataUrl });
          success('Logo updated successfully!');
        } else {
          setForm((prev) => ({ ...prev, restaurantLogo: result }));
          settingsDB.update({ restaurantLogo: result });
          success('Logo updated successfully!');
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setForm((prev) => ({ ...prev, restaurantLogo: '' }));
    settingsDB.update({ restaurantLogo: '' });
    info('Logo removed successfully.');
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    setIsImporting(true);
    try {
      const content = await file.text();
      const res = backupDB.import(content);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      if (!isSuccess) {
        const errorMsg = typeof res === 'object' && res.error ? res.error : 'Backup restore failed.';
        error(errorMsg);
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

  return (
    <div className="space-y-4">
      {/* Top Action Bar (No duplicate title) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
            <Settings size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
              {form.restaurantName || 'Restaurant Settings'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {cloudState.status === 'connected' ? '🟢 Cloud Sync Active' : '🟡 Offline Mode'}
            </p>
          </div>
        </div>
        <Button onClick={saveSettings} leftIcon={<Save size={16} />} variant="primary" className="font-bold shadow-xs">
          {t('saveChanges', 'Save Changes')}
        </Button>
      </div>

      {/* Restaurant Profile Card with Compact Logo */}
      <Card className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {form.restaurantLogo ? (
                <div className="relative group">
                  <img
                    src={form.restaurantLogo}
                    alt="Logo"
                    className="h-16 w-16 rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shadow-sm bg-white p-0.5"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 p-1 text-white shadow hover:bg-rose-700 transition-transform active:scale-90 cursor-pointer"
                    title={t('removeLogo', 'Remove')}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-400">
                  <ImageIcon size={24} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('restaurantProfile', 'Restaurant Profile')}
                </h3>
                {form.restaurantLogo ? (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5">
                    {t('logoActive', 'Logo Active')}
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-medium px-2 py-0.5">
                    {t('defaultIcon', 'Default Icon')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 active:scale-95 transition-all shadow-xs">
                  <Upload size={13} />
                  {form.restaurantLogo ? t('changePhoto', 'Change Photo') : t('uploadPhoto', 'Upload Photo')}
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/svg+xml"
                    className="hidden"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] || null)}
                  />
                </label>
                {form.restaurantLogo && (
                  <Button variant="danger" size="sm" onClick={handleRemoveLogo} className="py-1 text-xs" leftIcon={<Trash2 size={13} />}>
                    {t('removeLogo', 'Remove')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label={t('restaurantName', 'Restaurant Name')} value={form.restaurantName} onChange={(e) => setForm((prev) => ({ ...prev, restaurantName: e.target.value }))} />
          <Input label={t('phone', 'Phone')} value={form.restaurantPhone} onChange={(e) => setForm((prev) => ({ ...prev, restaurantPhone: e.target.value }))} />
          <div className="md:col-span-2">
            <Textarea label={t('address', 'Address')} value={form.restaurantAddress} onChange={(e) => setForm((prev) => ({ ...prev, restaurantAddress: e.target.value }))} rows={2} />
          </div>
          <Input
            label={taxLabel}
            placeholder={form.currency === 'INR' ? 'GSTIN (e.g. 22AAAAA0000A1Z5)' : 'Tax ID / Registration Number'}
            value={form.gstNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, gstNumber: e.target.value }))}
          />
          <Input
            label={taxPercentageLabel}
            type="number"
            value={String(form.taxPercentage)}
            onChange={(e) => setForm((prev) => ({ ...prev, taxPercentage: Number(e.target.value) }))}
          />
          <Select
            label={t('currency', 'Region & Currency')}
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
            label={t('currencySymbol', 'Currency Symbol')}
            value={form.currencySymbol}
            onChange={(e) => setForm((prev) => ({ ...prev, currencySymbol: e.target.value }))}
          />
        </div>
      </Card>

      {/* Language & System Settings Card */}
      <Card className="space-y-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {t('languageSettings', 'Language & System Settings')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label={t('language', 'Application Language')}
            value={language}
            onChange={(e) => {
              const code = e.target.value;
              setForm((prev) => ({ ...prev, language: code }));
              setLanguage(code);
            }}
            options={SUPPORTED_LANGUAGES.map((l) => ({
              value: l.code,
              label: `${l.flag} ${l.nativeName} (${l.name})`,
            }))}
          />
          <Input
            label={t('backupInterval', 'Auto-Backup Interval (hrs)')}
            type="number"
            value={String(form.backupInterval)}
            onChange={(e) => setForm((prev) => ({ ...prev, backupInterval: Number(e.target.value) }))}
          />
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoBackup}
              onChange={(e) => setForm((prev) => ({ ...prev, autoBackup: e.target.checked }))}
              className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('autoBackup', 'Enable Automatic Background Backups')}
            </span>
          </label>
        </div>
      </Card>

      {/* Customer Calling Alerts & Ringtone */}
      <Card className="space-y-4 border border-amber-200/80 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/40 to-orange-50/20 dark:from-amber-950/20 dark:to-orange-950/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <BellRing size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {t('callingAlerts', 'Customer Calling Alert')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Audio chime & vibration played on tablets and mobile phones
              </p>
            </div>
          </div>
        </div>

        {/* Sound Selection Dropdown + Preview */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Select
              label={t('callingAlertSound', 'Alert Ringtone')}
              value={form.waiterCallSound || 'chime'}
              onChange={(e) => {
                const snd = e.target.value as any;
                setForm((prev) => ({ ...prev, waiterCallSound: snd }));
                settingsDB.update({ waiterCallSound: snd });
                soundService.testSound(snd);
              }}
              options={[
                { value: 'chime', label: '🔔 Chime (Melodic 3-Tone)' },
                { value: 'bell', label: '🛎️ Service Bell (Ding-Dong)' },
                { value: 'urgent', label: '🚨 Urgent (High Chimes)' },
                { value: 'gentle', label: '🎶 Marimba (Warm Triad)' },
                { value: 'pager', label: '📟 Pager (Triple Beep)' },
              ]}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => soundService.testSound(form.waiterCallSound || 'chime')}
            className="text-xs font-semibold shrink-0"
            leftIcon={<Volume2 size={16} />}
          >
            {t('preview', 'Preview Alert')}
          </Button>
        </div>

        {/* Vibration Toggle */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/60 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <Smartphone size={18} className="text-amber-600 dark:text-amber-400" />
            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
              {t('vibration', 'Physical Vibration on Tablets & Mobile Phones')}
            </span>
          </div>
          <input
            type="checkbox"
            checked={form.waiterCallVibration !== false}
            onChange={(e) => {
              const val = e.target.checked;
              setForm((prev) => ({ ...prev, waiterCallVibration: val }));
              settingsDB.update({ waiterCallVibration: val });
            }}
            className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
          />
        </label>
      </Card>

      {/* Cloud Synchronization Card */}
      <Card className="space-y-4 border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Cloud size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {t('cloudSync', 'Cloud Synchronization')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automated multi-device real-time sync across mobile phones, tablets, and POS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cloudState.status === 'connected' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {t('connected', 'Cloud Connected')}
              </span>
            )}
            {cloudState.status === 'connecting' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
                {t('connecting', 'Connecting...')}
              </span>
            )}
            {cloudState.status === 'error' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                Cloud Error
              </span>
            )}
            {cloudState.status === 'disconnected' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                {t('offline', 'Offline Mode')}
              </span>
            )}
          </div>
        </div>

        {/* Quick Sync Actions */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkFirebaseHealth()}
            isLoading={cloudState.status === 'connecting'}
            leftIcon={<RefreshCw size={14} />}
          >
            {t('syncNow', 'Sync Now')}
          </Button>
          {cloudState.status === 'connected' && (
            <Button
              variant="outline"
              size="sm"
              className="text-emerald-700 border-emerald-300 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              onClick={handleUploadAllToCloud}
              isLoading={isUploadingToCloud}
              leftIcon={<Upload size={14} />}
            >
              {t('uploadToCloud', 'Upload Local Data to Cloud')}
            </Button>
          )}
        </div>

        {/* Advanced Developer Accordion (Tucked away cleanly) */}
        <details className="mt-2 text-xs group">
          <summary className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer font-medium select-none py-1">
            ⚙️ Advanced: Custom Firebase Credentials (Optional)
          </summary>
          <div className="mt-3 space-y-3 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <textarea
              rows={2}
              value={rawFirebaseJson}
              onChange={(e) => handlePasteFirebaseJson(e.target.value)}
              placeholder={`Paste your firebaseConfig object here:\n{\n  "apiKey": "AIzaSy...",\n  "projectId": "myapp-970f1"\n}`}
              className="w-full rounded-xl border border-gray-300 p-2.5 font-mono text-xs dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="API Key" value={firebaseConfig.apiKey} onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, apiKey: e.target.value }))} />
              <Input label="Project ID" value={firebaseConfig.projectId} onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, projectId: e.target.value }))} />
              <Input label="Auth Domain" value={firebaseConfig.authDomain} onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, authDomain: e.target.value }))} />
              <Input label="App ID" value={firebaseConfig.appId} onChange={(e) => setFirebaseConfig((prev) => ({ ...prev, appId: e.target.value }))} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button variant="primary" size="sm" onClick={handleSaveFirebaseConfig} isLoading={isTestingConnection} leftIcon={<Save size={14} />}>
                Save Credentials
              </Button>
              <Button variant="outline" size="sm" onClick={handleTestOnlyConnection} isLoading={isTestingConnection} leftIcon={<RefreshCw size={14} />}>
                Test Connection
              </Button>
              {(hasStoredFirebaseConfig() || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)) && (
                <Button variant="danger" size="sm" onClick={handleDisconnectFirebase} leftIcon={<Trash2 size={14} />}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </details>
      </Card>

      {/* Data Management Card */}
      <Card className="space-y-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {t('dataManagement', 'Data Management')}
        </h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => backupDB.downloadBackup()} leftIcon={<Download size={16} />}>
            {t('downloadBackup', 'Download Backup')}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
            <Upload size={16} />
            {isImporting ? 'Importing...' : t('restoreBackup', 'Restore Backup')}
            <input type="file" accept="application/json" className="hidden" onChange={(e) => void importBackup(e.target.files?.[0] || null)} />
          </label>
        </div>
      </Card>
    </div>
  );
}

export function UserManagementPage() {
  const tick = useDbUpdate();
  const { success, error } = useToast();
  const users = useMemo(() => userDB.getAll(), [tick]);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'manager' as UserRole, isActive: true });

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setForm({ username: user.username, password: '', role: user.role, isActive: user.isActive });
    } else {
      setEditingUser(null);
      setForm({ username: '', password: '', role: 'manager', isActive: true });
    }
    setShowModal(true);
  };

  const saveUser = () => {
    const userVal = validateUsername(form.username);
    if (!userVal.isValid) {
      error(userVal.error || 'Invalid username.');
      return;
    }

    if (!editingUser || form.password.trim()) {
      const passVal = validatePassword(form.password);
      if (!passVal.isValid) {
        error(passVal.error || 'Invalid password.');
        return;
      }
    }

    const cleanUsername = userVal.cleanValue;
    const existing = userDB.getAll().find((user) => user.username.toLowerCase() === cleanUsername.toLowerCase() && user.id !== editingUser?.id);
    if (existing) {
      error(`Username "${cleanUsername}" already exists. Please choose another username or edit the existing account.`);
      return;
    }

    if (editingUser) {
      userDB.update(editingUser.id, {
        username: cleanUsername,
        role: form.role,
        isActive: form.isActive,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      });
      success(`User "${cleanUsername}" (${form.role.toUpperCase()}) updated successfully.`);
    } else {
      userDB.create({ username: cleanUsername, password: form.password.trim(), role: form.role, isActive: form.isActive });
      success(`User "${cleanUsername}" created as ${form.role.toUpperCase()} successfully.`);
    }

    setShowModal(false);
  };

  const deleteUser = (user: User) => {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    userDB.delete(user.id);
    success('User deleted.');
  };

  const roleDescriptions: Record<UserRole, { label: string; desc: string; color: string }> = {
    admin: { label: 'Admin', desc: 'Full access to all 12 modules & settings', color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300' },
    manager: { label: 'Manager', desc: 'POS, Orders, Kitchen, Menu, Inventory, Staff & Reports', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300' },
    cashier: { label: 'Cashier', desc: 'POS billing, live orders, tables & dashboard', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300' },
    waiter: { label: 'Waiter', desc: 'Table management, customer orders, POS billing', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300' },
    chef: { label: 'Chef', desc: 'Kitchen Display System & orders', color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300' },
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        stats={
          <>
            <StatChip icon={<Users size={14} />} label="Users" value={users.length} color="blue" />
            <StatChip icon={<CheckCircle2 size={14} />} label="Active" value={users.filter((user) => user.isActive).length} color="green" />
            <StatChip icon={<UserCog size={14} />} label="Admins & Mgrs" value={users.filter((user) => user.role === 'admin' || user.role === 'manager').length} color="purple" />
            <StatChip icon={<Receipt size={14} />} label="Staff" value={users.filter((user) => user.role === 'waiter' || user.role === 'chef' || user.role === 'cashier').length} color="yellow" />
          </>
        }
        action={<Button size="sm" onClick={() => openModal()} leftIcon={<Plus size={14} />}>Add User</Button>}
      />

      <DataTable
        columns={[
          {
            key: 'username',
            header: 'Username',
            render: (user) => (
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{user.username}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Created {format(new Date(user.createdAt), 'PPP')}</p>
              </div>
            ),
          },
          {
            key: 'role',
            header: 'Role & Permissions',
            render: (user) => (
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider border ${roleDescriptions[user.role]?.color || 'bg-gray-100 text-gray-800'}`}>
                {roleDescriptions[user.role]?.label || user.role}
              </span>
            ),
          },
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
        emptyMessage="No users found. Click 'Add User' to create a manager, waiter, chef, or cashier account."
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingUser ? 'Edit User Account' : 'Add New Staff User'}>
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="e.g. manager1 or john" maxLength={USERNAME_MAX_LENGTH} spellCheck={false} />
          <Input label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'} type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="3 to 72 characters" maxLength={PASSWORD_MAX_LENGTH} spellCheck={false} />
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Role & Access Level
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
              className="w-full rounded-xl border border-gray-300 bg-white p-2.5 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white cursor-pointer"
            >
              <option value="admin">Admin — 👑 Master Access (All Modules + Users & Settings)</option>
              <option value="manager">Manager — 💼 Operations (POS, Orders, Kitchen, Menu, Inventory, Staff & Reports)</option>
              <option value="cashier">Cashier — 💳 Counter Billing (POS, Orders, Tables & Dashboard)</option>
              <option value="waiter">Waiter — 🍽️ Floor Staff (Tables, Orders, POS Billing)</option>
              <option value="chef">Chef — 👨‍🍳 Kitchen Team (Kitchen Display & Orders)</option>
            </select>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
              {(Object.keys(roleDescriptions) as UserRole[]).map((r) => {
                const info = roleDescriptions[r];
                const isSelected = form.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, role: r }))}
                    className={`flex flex-col text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500 ring-2 ring-blue-500/20'
                        : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="font-bold text-sm text-gray-900 dark:text-white capitalize flex items-center justify-between">
                      {info.label}
                      {isSelected && <span className="h-2 w-2 rounded-full bg-blue-600"></span>}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {info.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} className="rounded text-blue-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">User account is active & permitted to log in</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={saveUser} className="bg-blue-600 hover:bg-blue-700 font-bold">Save User</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

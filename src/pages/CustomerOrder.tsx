import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  X,
  ChefHat,
  BellRing,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '../utils/cn';
import {
  categoryDB,
  menuItemDB,
  notificationDB,
  orderDB,
  settingsDB,
  tableDB,
} from '../database/db';
import type { MenuItem, Order, OrderItem } from '../types';
import { formatCurrency } from '../utils/formatCurrency';
import { useDbUpdate } from '../hooks/useDbUpdate';

interface CartItem extends OrderItem {
  menuItem: MenuItem;
}

interface CustomerOrderPageProps {
  tableNumber: number;
  onExit?: () => void;
}

export const SPICE_LEVELS: Array<{ id: NonNullable<OrderItem['spiceLevel']>; label: string; icon: string; desc: string }> = [
  { id: '1 - Mild (甘口)', label: '1 - Mild (甘口)', icon: '🌶️', desc: 'Mild & Smooth' },
  { id: '2 - Medium (中辛)', label: '2 - Medium (中辛)', icon: '🌶️🌶️', desc: 'Standard Medium' },
  { id: '3 - Spicy (辛口)', label: '3 - Spicy (辛口)', icon: '🌶️🌶️🌶️', desc: 'Hot & Zesty' },
  { id: '4 - Very Spicy (激辛)', label: '4 - Very Spicy (激辛)', icon: '🌶️🌶️🌶️🌶️', desc: 'Extra Spicy' },
  { id: '5 - Crazy Hot (超激辛)', label: '5 - Crazy Hot (超激辛)', icon: '🌶️🌶️🌶️🌶️🌶️', desc: 'Chef Special Heat' },
];

export const DRINK_OPTIONS = [
  'Mango Lassi (マンゴーラッシー)',
  'Plain Lassi (プレーンラッシー)',
  'Hot Masala Chai (ホットマサラチャイ)',
  'Iced Tea (アイスティー)',
  'Oolong Tea (ウーロン茶)',
  'Coca-Cola (コカ・コーラ)',
  'Orange Juice (オレンジジュース)',
];

export function CustomerOrderPage({ tableNumber, onExit }: CustomerOrderPageProps) {
  // Subscribe to DB updates & real-time sync for customer view
  useDbUpdate();

  useEffect(() => {
    import('../services/realtimeSync').then(({ realtimeSync }) => {
      realtimeSync.init();
    }).catch(() => {});
  }, []);

  const settings = settingsDB.get();
  
  // Ensure table exists in database
  const table = useMemo(() => {
    let t = tableDB.getAll().find((tbl) => tbl.number === tableNumber);
    if (!t) {
      t = tableDB.create({
        number: tableNumber,
        capacity: 4,
        status: 'occupied',
        qrCode: `?table=${tableNumber}`,
      });
    }
    return t;
  }, [tableNumber]);

  const categories = useMemo(
    () => categoryDB.getAll().filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    []
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Customization Modal State
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedSpiceLevel, setSelectedSpiceLevel] = useState<NonNullable<OrderItem['spiceLevel']>>('2 - Medium (中辛)');
  const [selectedDrinkOption, setSelectedDrinkOption] = useState<string>('Mango Lassi (マンゴーラッシー)');
  const [itemCustomNotes, setItemCustomNotes] = useState<string>('');

  // Load draft cart from localStorage if present
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(`restaurant_cart_table_${tableNumber}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save cart to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem(`restaurant_cart_table_${tableNumber}`, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, tableNumber]);

  // Saved customer details
  const [customerName, setCustomerName] = useState(() => {
    return localStorage.getItem('customer_name') || '';
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    return localStorage.getItem('customer_phone') || '';
  });

  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

  // Active orders for this table
  const activeOrders = useMemo(() => {
    return orderDB
      .getAll()
      .filter((o) => o.tableNumber === tableNumber && o.status !== 'completed' && o.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tableNumber]);

  const [vegFilter, setVegFilter] = useState<'all' | 'veg' | 'nonveg'>('all');

  const menuItems = useMemo(() => {
    let items = menuItemDB.getAll().filter((m) => m.isAvailable !== false);
    if (selectedCategory) items = items.filter((m) => m.categoryId === selectedCategory);
    if (vegFilter === 'veg') items = items.filter((m) => m.isVeg);
    if (vegFilter === 'nonveg') items = items.filter((m) => !m.isVeg);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [selectedCategory, vegFilter, search]);

  const groupedMenuItems = useMemo(() => {
    const map = new Map<string, { categoryName: string; icon?: string; items: MenuItem[] }>();
    const sortedCats = categoryDB.getAll().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    sortedCats.forEach((cat) => {
      map.set(cat.id, { categoryName: cat.name, icon: cat.icon, items: [] });
    });

    menuItems.forEach((item) => {
      if (map.has(item.categoryId)) {
        map.get(item.categoryId)!.items.push(item);
      } else {
        if (!map.has('other')) {
          map.set('other', { categoryName: 'Specialties', icon: '🍽️', items: [] });
        }
        map.get('other')!.items.push(item);
      }
    });

    return Array.from(map.values()).filter((group) => group.items.length > 0);
  }, [menuItems]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = subtotal * (settings.taxPercentage / 100);
  const total = subtotal + tax;

  const shouldShowSpiceOption = useCallback((item: MenuItem) => {
    if (item.allowsSpiceLevel === false) return false;
    const cat = categoryDB.getById(item.categoryId);
    const catName = (cat?.name || '').toLowerCase();
    const nameLower = item.name.toLowerCase();

    // Exclude non-spicy items like drinks, beverages, desserts
    if (
      catName.includes('beverage') ||
      catName.includes('drink') ||
      catName.includes('dessert') ||
      nameLower.includes('lassi') ||
      nameLower.includes('chai') ||
      nameLower.includes('beer') ||
      nameLower.includes('juice') ||
      nameLower.includes('soda') ||
      nameLower.includes('tea') ||
      nameLower.includes('water')
    ) {
      return false;
    }

    return true;
  }, []);

  const shouldShowDrinkOption = useCallback((item: MenuItem) => {
    if (item.includesDrink === true) return true;
    const cat = categoryDB.getById(item.categoryId);
    const catName = (cat?.name || '').toLowerCase();
    const nameLower = item.name.toLowerCase();

    return (
      catName.includes('set') ||
      catName.includes('combo') ||
      nameLower.includes('set') ||
      nameLower.includes('セット') ||
      nameLower.includes('thali') ||
      nameLower.includes('combo') ||
      nameLower.includes('maharaja') ||
      nameLower.includes('ladies') ||
      nameLower.includes('lunch') ||
      nameLower.includes('special')
    );
  }, []);

  const openCustomizationModal = useCallback((item: MenuItem) => {
    setCustomizingItem(item);
    setSelectedSpiceLevel('2 - Medium (中辛)');
    setSelectedDrinkOption('Mango Lassi (マンゴーラッシー)');
    setItemCustomNotes('');
  }, []);

  const confirmAddToCartWithOptions = useCallback(() => {
    if (!customizingItem) return;

    const showSpice = shouldShowSpiceOption(customizingItem);
    const showDrink = shouldShowDrinkOption(customizingItem);

    const spiceVal = showSpice ? selectedSpiceLevel : undefined;
    const drinkVal = showDrink ? selectedDrinkOption : undefined;
    const noteVal = itemCustomNotes.trim() || undefined;

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.menuItemId === customizingItem.id &&
          item.spiceLevel === spiceVal &&
          item.selectedDrink === drinkVal &&
          item.notes === noteVal
      );

      if (existingIndex > -1) {
        return prev.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          id: uuidv4(),
          menuItemId: customizingItem.id,
          menuItemName: customizingItem.name,
          quantity: 1,
          unitPrice: customizingItem.price,
          totalPrice: customizingItem.price,
          spiceLevel: spiceVal,
          selectedDrink: drinkVal,
          notes: noteVal,
          status: 'pending' as const,
          menuItem: customizingItem,
        },
      ];
    });

    setCustomizingItem(null);
  }, [customizingItem, itemCustomNotes, selectedDrinkOption, selectedSpiceLevel, shouldShowDrinkOption, shouldShowSpiceOption]);

  const addToCart = useCallback((menuItem: MenuItem) => {
    openCustomizationModal(menuItem);
  }, [openCustomizationModal]);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return { ...item, quantity: 0, totalPrice: 0 };
          return { ...item, quantity: newQty, totalPrice: newQty * item.unitPrice };
        })
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const placeOrder = () => {
    if (cart.length === 0) return;

    const finalCustomerName = customerName.trim() || `Table ${tableNumber}`;

    const orderItems: OrderItem[] = cart.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      spiceLevel: item.spiceLevel,
      selectedDrink: item.selectedDrink,
      notes: item.notes,
      status: 'pending',
    }));

    const order = orderDB.create({
      tableId: table?.id,
      tableNumber,
      type: 'dine-in',
      items: orderItems,
      subtotal,
      tax,
      discount: 0,
      discountType: 'fixed',
      total,
      status: 'active',
      customerName: finalCustomerName,
      customerPhone: customerPhone.trim() || undefined,
      notes: orderNotes.trim() || undefined,
    });

    setOrderNotes('');

    notificationDB.create({
      type: 'order',
      title: '📱 New QR Order!',
      message: `Table ${tableNumber} placed order ${order.orderNumber} via QR code (${formatCurrency(total)})`,
    });

    setPlacedOrderNumber(order.orderNumber);
    setOrderPlaced(true);
    setCart([]);
    localStorage.removeItem(`restaurant_cart_table_${tableNumber}`);
    setShowCart(false);
  };

  const renderStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-300 dark:border-green-700">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> Order Placed ✅
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <ChefHat className="h-3.5 w-3.5" /> Kitchen Preparing 🍳
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <BellRing className="h-3.5 w-3.5 animate-bounce" /> Order Ready! 🔔
          </span>
        );
      case 'served':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Check className="h-3.5 w-3.5" /> Served 🍽️
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {status}
          </span>
        );
    }
  };

  // Order success screen
  if (orderPlaced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-6 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-200">
            <Check className="h-12 w-12 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Order Placed!</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Your order <strong className="text-green-700 dark:text-green-400">{placedOrderNumber}</strong> has been sent directly to the kitchen.
          </p>
          <div className="rounded-2xl bg-white p-6 shadow-lg dark:bg-gray-800 dark:text-white">
            <div className="flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
              <UtensilsCrossed size={20} />
              <span>Table {tableNumber}</span>
            </div>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Our chef and team are preparing your fresh order now. You can order more items anytime from the menu!
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setOrderPlaced(false)}
              className="w-full rounded-xl bg-green-600 py-3.5 font-semibold text-white shadow-md hover:bg-green-700 active:scale-95 transition-all"
            >
              Order Additional Items
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 pb-24">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur shadow-sm dark:bg-gray-800/95">
        <div className="mx-auto flex max-w-lg items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {showCart || selectedCategory || search ? (
              <button
                onClick={() => {
                  if (showCart) setShowCart(false);
                  else if (selectedCategory) setSelectedCategory(null);
                  else if (search) setSearch('');
                }}
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold shadow-md">
                {tableNumber}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {settings.restaurantName}
              </h1>
              <p className="text-xs text-blue-600 font-semibold dark:text-blue-400">
                Table {tableNumber} • Digital Menu
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 rounded-xl bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
          >
            <ShoppingCart size={18} />
            <span>Cart</span>
            {cartCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Input */}
        <div className="mx-auto max-w-lg px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search dishes or drinks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Categories & Dietary Filter Bar */}
        <div className="no-scrollbar flex flex-col gap-2.5 px-4 pb-3">
          {/* Veg / Non-Veg Quick Pill Filter */}
          <div className="flex items-center gap-1.5 rounded-xl bg-gray-100 p-1 dark:bg-gray-800/80 w-fit text-xs font-semibold">
            <button
              onClick={() => setVegFilter('all')}
              className={cn(
                'rounded-lg px-3 py-1 transition-all',
                vegFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-xs dark:bg-gray-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              )}
            >
              All Dishes
            </button>
            <button
              onClick={() => setVegFilter('veg')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-1 transition-all',
                vegFilter === 'veg'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
              )}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-xs border border-emerald-300 bg-emerald-500" />
              Veg Only
            </button>
            <button
              onClick={() => setVegFilter('nonveg')}
              className={cn(
                'flex items-center gap-1 rounded-lg px-3 py-1 transition-all',
                vegFilter === 'nonveg'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30'
              )}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-xs border border-rose-300 bg-rose-500" />
              Non-Veg
            </button>
          </div>

          {/* Category Pills */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                selectedCategory === null
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
              )}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5',
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                )}
              >
                <span>{cat.icon || '🍽️'}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-lg px-4 pt-4 pb-36 space-y-6">
        {/* Active Orders Status Banner */}
        {activeOrders.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between pb-2 border-b border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center gap-2">
                <Receipt className="text-amber-600 dark:text-amber-400" size={20} />
                <h3 className="font-bold text-amber-900 dark:text-amber-200">
                  Active Table Orders ({activeOrders.length})
                </h3>
              </div>
              <span className="text-xs text-amber-700 dark:text-amber-300">Live Status</span>
            </div>

            <div className="mt-3 space-y-3">
              {activeOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="rounded-xl bg-white p-3 shadow-xs dark:bg-gray-800 border border-gray-100 dark:border-gray-700 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        {ord.orderNumber}
                      </span>
                      <p className="text-xs text-gray-500">
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {renderStatusBadge(ord.status)}
                  </div>

                  <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                    {ord.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>
                          {it.quantity}× {it.menuItemName}
                        </span>
                        <span className="font-medium">{formatCurrency(it.totalPrice)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white">
                    <span>Total Bill Amount</span>
                    <span className="text-blue-600 dark:text-blue-400">{formatCurrency(ord.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Menu Items List - Category Section Grouped */}
        {menuItems.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            <UtensilsCrossed size={48} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="font-semibold text-base">No matching dishes found</p>
            <p className="text-xs text-gray-400 mt-1">Try resetting search or selecting another category</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedMenuItems.map((group) => (
              <section key={group.categoryName} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-800">
                  <span className="text-lg">{group.icon || '🍽️'}</span>
                  <h2 className="font-bold text-base text-gray-900 dark:text-white">
                    {group.categoryName}
                  </h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {group.items.length}
                  </span>
                </div>

                <div className="grid gap-3">
                  {group.items.map((item) => {
                    const inCart = cart.find((c) => c.menuItemId === item.id);
                    const imageSrc = item.imageUrl || (item as any).image;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 sm:gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700/60 overflow-hidden w-full"
                      >
                        {/* Food Image Thumbnail */}
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={item.name}
                            className="h-16 w-16 sm:h-18 sm:w-18 shrink-0 rounded-xl object-cover border border-gray-100 dark:border-gray-700"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex h-16 w-16 sm:h-18 sm:w-18 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 font-bold text-lg sm:text-xl dark:from-gray-700 dark:to-gray-800 dark:text-blue-400">
                            {item.name.charAt(0)}
                          </div>
                        )}

                        {/* Dish Information (Clickable to view full details & options) */}
                        <div
                          onClick={() => openCustomizationModal(item)}
                          className="min-w-0 flex-1 space-y-0.5 pr-0.5 cursor-pointer"
                        >
                          <div className="flex items-start gap-1.5">
                            {/* Veg / Non-Veg Icon */}
                            <span
                              className={cn(
                                'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border p-0.5',
                                item.isVeg
                                  ? 'border-emerald-600 dark:border-emerald-400'
                                  : 'border-rose-600 dark:border-rose-400'
                              )}
                              title={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                            >
                              <span
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  item.isVeg ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-rose-600 dark:bg-rose-400'
                                )}
                              />
                            </span>
                            <h3 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white leading-snug line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                              {item.name}
                            </h3>
                          </div>

                          {item.description && (
                            <p className="line-clamp-1 text-[11px] text-gray-500 dark:text-gray-400">
                              {item.description}
                            </p>
                          )}

                          <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm">
                            <span className="font-black text-blue-600 dark:text-blue-400">
                              {formatCurrency(item.price)}
                            </span>
                            {item.preparationTime && (
                              <span className="flex items-center gap-0.5 text-[10px] sm:text-[11px] text-gray-400">
                                <Clock size={11} />
                                {item.preparationTime}m
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400 underline decoration-dotted">Details</span>
                          </div>
                        </div>

                        {/* Add / Stepper Button */}
                        <div className="shrink-0 min-w-max flex items-center justify-end">
                          {inCart ? (
                            <div className="flex items-center gap-1 rounded-xl bg-blue-50 p-1 dark:bg-blue-900/30">
                              <button
                                onClick={() => updateQty(inCart.id, -1)}
                                className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-xs active:scale-90 transition-all dark:bg-gray-800 dark:text-blue-400"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="w-4 text-center font-bold text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                                {inCart.quantity}
                              </span>
                              <button
                                onClick={() => updateQty(inCart.id, 1)}
                                className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs active:scale-90 transition-all"
                                aria-label="Increase quantity"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all cursor-pointer"
                            >
                              <Plus size={14} />
                              <span>ADD</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (Visible if cart has items OR active orders exist) */}
      {(cartCount > 0 || activeOrders.length > 0) && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg">
          <button
            onClick={() => setShowCart(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-xl shadow-blue-500/20 active:scale-98 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 font-bold">
                {cartCount > 0 ? cartCount : activeOrders.length}
              </div>
              <div className="text-left">
                <p className="text-xs text-blue-100 font-medium">
                  {cartCount > 0 ? 'Cart Total' : 'Active Orders Placed'}
                </p>
                <p className="font-bold text-base">
                  {cartCount > 0 ? formatCurrency(total) : `${activeOrders.length} Active Order(s)`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 font-bold text-sm">
              <span>{cartCount > 0 ? 'View Cart & Order' : 'View Order Status'}</span>
              {cartCount > 0 ? <ShoppingCart size={18} /> : <Receipt size={18} />}
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer / Slide-up Modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-blue-600" size={22} />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your Orders & Cart</h2>
              </div>
              <button
                onClick={() => setShowCart(false)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {/* Active Placed Orders for this Table */}
              {activeOrders.length > 0 && (
                <div className="space-y-3 rounded-2xl bg-amber-50/80 p-3.5 border border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/40">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-200/60 dark:border-amber-900/40">
                    <div className="flex items-center gap-2">
                      <Receipt className="text-amber-600 dark:text-amber-400" size={18} />
                      <h3 className="font-bold text-xs text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                        Active Placed Orders ({activeOrders.length})
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {activeOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="rounded-xl bg-white p-3 shadow-xs dark:bg-gray-800 border border-gray-100 dark:border-gray-700 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-sm text-gray-900 dark:text-white">
                              {ord.orderNumber}
                            </span>
                            <p className="text-xs text-gray-500">
                              {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {renderStatusBadge(ord.status)}
                        </div>

                        {ord.notes && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-2 text-[11px] text-amber-900 dark:text-amber-200">
                            <span className="font-bold">🚨 Order Request: </span>
                            <span>{ord.notes}</span>
                          </div>
                        )}

                        <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                          {ord.items.map((it) => (
                            <div key={it.id} className="flex justify-between flex-wrap gap-1">
                              <div>
                                <span className="font-semibold">
                                  {it.quantity}× {it.menuItemName}
                                </span>
                                {(it.spiceLevel || it.selectedDrink || it.notes) && (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    {it.spiceLevel && <span className="text-rose-600 dark:text-rose-400 font-bold">🌶️ {it.spiceLevel}</span>}
                                    {it.selectedDrink && <span className="text-blue-600 dark:text-blue-400 font-bold">🥤 {it.selectedDrink}</span>}
                                    {it.notes && <span className="text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-950/40 px-1 rounded">📝 {it.notes}</span>}
                                  </div>
                                )}
                              </div>
                              <span className="font-medium">{formatCurrency(it.totalPrice)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white">
                          <span>Total Amount</span>
                          <span className="text-blue-600 dark:text-blue-400">{formatCurrency(ord.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft Cart Items */}
              {cart.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider">
                    Unplaced Items in Cart ({cartCount})
                  </h3>
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50"
                    >
                      <div className="flex-1 pr-3">
                        <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
                          {item.menuItemName}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {item.spiceLevel && (
                            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              🌶️ {item.spiceLevel}
                            </span>
                          )}
                          {item.selectedDrink && (
                            <span className="rounded-md bg-blue-100 px-1.5 py-0.5 font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              🥤 {item.selectedDrink}
                            </span>
                          )}
                          {item.notes && <span className="italic text-amber-600 dark:text-amber-400">({item.notes})</span>}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {formatCurrency(item.unitPrice)} × {item.quantity}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 shadow-xs dark:bg-gray-800">
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            className="text-gray-500 hover:text-blue-600"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.id, 1)}
                            className="text-gray-500 hover:text-blue-600"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <span className="w-16 text-right font-bold text-sm text-gray-900 dark:text-white">
                          {formatCurrency(item.totalPrice)}
                        </span>

                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                activeOrders.length === 0 && (
                  <div className="py-8 text-center text-gray-500">
                    <ShoppingCart size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm font-medium">Your cart is empty</p>
                  </div>
                )
              )}
            </div>

            {/* Price Summary & Action */}
            {cart.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Tax ({settings.taxPercentage}%)</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-700">
                  <span>New Order Total</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatCurrency(total)}</span>
                </div>

                {/* Overall Order Special Instructions */}
                <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <span>📝 Order Request / Note for Kitchen (Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Please bring extra cutlery, serve food hot..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs focus:border-blue-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  />
                </div>

                <button
                  onClick={placeOrder}
                  className="mt-2 w-full rounded-xl bg-blue-600 py-3.5 font-bold text-white shadow-lg hover:bg-blue-700 active:scale-98 transition-all cursor-pointer"
                >
                  Place New Order • {formatCurrency(total)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dish Options & Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {(customizingItem.imageUrl || (customizingItem as any).image) ? (
                  <img
                    src={customizingItem.imageUrl || (customizingItem as any).image}
                    alt={customizingItem.name}
                    className="h-14 w-14 rounded-xl object-cover border border-gray-100 dark:border-gray-700"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 font-bold text-blue-600 text-lg dark:bg-blue-900/40 dark:text-blue-300">
                    {customizingItem.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white leading-tight">
                    {customizingItem.name}
                  </h3>
                  <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {formatCurrency(customizingItem.price)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            {/* Dish Info Details Box inside Modal */}
            <div className="rounded-2xl bg-blue-50/50 p-3.5 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 space-y-2 text-xs">
              {customizingItem.description && (
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-normal">
                  {customizingItem.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border',
                  customizingItem.isVeg
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300'
                )}>
                  {customizingItem.isVeg ? '🌱 Vegetarian' : '🍗 Non-Vegetarian'}
                </span>
                {customizingItem.preparationTime && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                    <Clock size={11} />
                    {customizingItem.preparationTime}m prep time
                  </span>
                )}
              </div>
              {customizingItem.ingredients && customizingItem.ingredients.length > 0 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                  <span className="font-bold text-gray-700 dark:text-gray-300">Ingredients:</span> {customizingItem.ingredients.join(', ')}
                </p>
              )}
            </div>

            {/* 5-Stage Spice Level Selection - Compact Horizontal 1-Line Segment Bar */}
            {shouldShowSpiceOption(customizingItem) && (
              <div className="space-y-2 rounded-2xl bg-rose-50/50 p-3.5 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                    <span>🌶️ Spice Level (5 Stages)</span>
                  </label>
                  {selectedSpiceLevel && (
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded-full">
                      {selectedSpiceLevel}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {SPICE_LEVELS.map((lvl, idx) => {
                    const isSelected = selectedSpiceLevel === lvl.id;
                    const stageLabel = lvl.label.split('-')[1]?.trim() || lvl.label;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setSelectedSpiceLevel(lvl.id)}
                        className={cn(
                          'flex flex-col items-center justify-center rounded-xl py-2 px-1 text-center transition-all border cursor-pointer',
                          isSelected
                            ? 'border-rose-600 bg-gradient-to-b from-rose-500 to-rose-600 text-white font-bold shadow-md scale-105 z-10'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-rose-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        )}
                      >
                        <span className="text-[11px] font-black leading-none">{idx + 1}</span>
                        <span className="text-[10px] font-semibold truncate max-w-full leading-tight mt-1 opacity-95">
                          {stageLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Drink Selection */}
            {shouldShowDrinkOption(customizingItem) && (
              <div className="space-y-2 rounded-2xl bg-blue-50/60 p-4 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-blue-950 dark:text-blue-200 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🥤 Select Included Drink</span>
                  </label>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Included</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DRINK_OPTIONS.map((drink) => (
                    <button
                      key={drink}
                      type="button"
                      onClick={() => setSelectedDrinkOption(drink)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all border text-left cursor-pointer',
                        selectedDrinkOption === drink
                          ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      )}
                    >
                      <span>🥤</span>
                      <span className="truncate">{drink}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Special Instructions / Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Special Instructions / Allergy Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g., extra sauce, no onion, separate dressing..."
                value={itemCustomNotes}
                onChange={(e) => setItemCustomNotes(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs focus:border-blue-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddToCartWithOptions}
                className="flex-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 active:scale-98 transition-all cursor-pointer"
              >
                Confirm & Add to Order • {formatCurrency(customizingItem.price)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

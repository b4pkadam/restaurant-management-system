import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus, Minus, Trash2, Search, ShoppingCart, CreditCard, Banknote,
  Smartphone, User, Table2, Package, Check, Percent, DollarSign, ChefHat,
  BellRing, Printer, Lock
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { cn } from '../utils/cn';
import { v4 as uuidv4 } from 'uuid';
import {
  menuItemDB, categoryDB, tableDB, orderDB, paymentDB, settingsDB,
  notificationDB
} from '../database/db';
import type { MenuItem, OrderItem, Table, Order, Payment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency } from '../utils/formatCurrency';
import { printInvoice } from '../utils/printInvoice';

interface CartItem extends OrderItem {
  menuItem: MenuItem;
}

export const POSPage: React.FC = () => {
  const tick = useDbUpdate();
  const { user } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const { success, error } = useToast();
  const settings = settingsDB.get();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{ order: Order; payment: Payment } | null>(null);
  const [pendingTableAction, setPendingTableAction] = useState<'kitchen' | 'pay' | null>(null);

  // Mobile / Tablet Responsive View State
  const [mobileView, setMobileView] = useState<'menu' | 'cart'>('menu');

  // POS Item Customization Modal State
  const [posCustomizingItem, setPosCustomizingItem] = useState<{ menuItem: MenuItem; cartItemId?: string } | null>(null);
  const [posSpiceLevel, setPosSpiceLevel] = useState<string>('2 - Medium (中辛)');
  const [posDrinkOption, setPosDrinkOption] = useState<string>('Mango Lassi (マンゴーラッシー)');
  const [posNotes, setPosNotes] = useState<string>('');

  const SPICE_LEVELS = useMemo(() => [
    { id: '1 - Mild (甘口)', label: 'Mild (甘口)', icon: '🥦' },
    { id: '2 - Medium (中辛)', label: 'Medium (中辛)', icon: '🌶️' },
    { id: '3 - Spicy (辛口)', label: 'Spicy (辛口)', icon: '🔥' },
    { id: '4 - Very Spicy (激辛)', label: 'Very Spicy (激辛)', icon: '💥' },
    { id: '5 - Crazy Hot (超激辛)', label: 'Crazy Hot (超激辛)', icon: '☠️' },
  ], []);

  const DRINK_OPTIONS = useMemo(() => [
    'Mango Lassi (マンゴーラッシー)',
    'Plain Lassi (プレーンラッシー)',
    'Masala Chai (マサラチャイ)',
    'Iced Coffee (アイスコーヒー)',
    'Orange Juice (オレンジジュース)',
    'Oolong Tea (ウーロン茶)',
    'Pepsi (ペプシ)',
  ], []);
  
  const categories = useMemo(() => {
    return categoryDB
      .getAll()
      .filter((c) => c.isActive)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [tick]);
  const tables = useMemo(() => tableDB.getAll(), [tick]);
  
  // Active table orders pending payment — automatically reactive to DB updates
  const activeTableOrders = useMemo(() => {
    return orderDB
      .getAll()
      .filter((o) => {
        const isPaid = Boolean(o.paymentStatus === 'paid' || o.isPaid || paymentDB.getByOrder(o.id));
        return o.status !== 'completed' && o.status !== 'cancelled' && !isPaid;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tick]);

  const menuItems = useMemo(() => {
    let items = menuItemDB.getAll().filter((m) => m.isAvailable);
    
    if (selectedCategory) {
      items = items.filter((m) => m.categoryId === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter((m) => 
        m.name.toLowerCase().includes(query) ||
        m.barcode?.toLowerCase() === query
      );
    }

    const categoryOrderMap = new Map<string, number>();
    categories.forEach((c) => {
      categoryOrderMap.set(c.id, c.sortOrder ?? 0);
    });

    return items.sort((a, b) => {
      const orderA = categoryOrderMap.get(a.categoryId) ?? 999;
      const orderB = categoryOrderMap.get(b.categoryId) ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [selectedCategory, searchQuery, categories, tick]);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = discountType === 'percentage' 
    ? (subtotal * discount / 100) 
    : discount;
  const taxAmount = (subtotal - discountAmount) * (settings.taxPercentage / 100);
  const total = subtotal - discountAmount + taxAmount;
  const change = paymentMethod === 'cash' ? Number(cashReceived) - total : 0;

  const loadedOrder = useMemo(() => (loadedOrderId ? orderDB.getById(loadedOrderId) : null), [loadedOrderId, tick]);
  const hasPendingItems = useMemo(() => cart.some((it) => it.status === 'pending' || !it.status), [cart]);
  const isAlreadySentToKitchen = Boolean(loadedOrderId && !hasPendingItems);

  // Clear cart
  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedTable(null);
    setLoadedOrderId(null);
    setCustomerName('');
    setCustomerPhone('');
    setOrderNotes('');
    setDiscount(0);
    setCashReceived('');
  }, []);

  // Auto-clear cart if the loaded order was completed/cancelled on another terminal
  useEffect(() => {
    if (loadedOrderId) {
      const curr = orderDB.getById(loadedOrderId);
      if (!curr || curr.status === 'completed' || curr.status === 'cancelled') {
        clearCart();
      }
    }
  }, [loadedOrderId, tick, clearCart]);

  // Load active table order into POS cart
  const loadActiveOrder = useCallback((ord: Order) => {
    const latest = orderDB.getById(ord.id);
    if (!latest || latest.status === 'completed' || latest.status === 'cancelled') {
      error(`Order #${ord.orderNumber} is already completed / paid.`);
      return;
    }

    setLoadedOrderId(latest.id);
    setOrderType((latest.type as any) || 'dine-in');
    setCustomerName(latest.customerName || '');
    setCustomerPhone(latest.customerPhone || '');
    setOrderNotes(latest.notes || '');
    
    if (latest.tableNumber) {
      const tbl = tableDB.getAll().find((t) => t.number === latest.tableNumber);
      if (tbl) setSelectedTable(tbl);
    }

    const items: CartItem[] = latest.items.map((it) => {
      const foundMenu = menuItemDB.getById(it.menuItemId) || {
        id: it.menuItemId,
        name: it.menuItemName,
        price: it.unitPrice,
        cost: 0,
        categoryId: '',
        isAvailable: true,
        isVeg: true,
        preparationTime: 10,
        ingredients: [],
        createdAt: new Date().toISOString(),
      };
      return {
        ...it,
        menuItem: foundMenu,
      };
    });

    setCart(items);
    setShowTableModal(false);
    success(`Loaded Order #${latest.orderNumber} for Table ${latest.tableNumber || 'N/A'} (${formatCurrency(latest.total)})`);
  }, [error, success]);

  // Open POS Item Customization Modal
  // Open POS Item Customization Modal
  const openPosItemModal = useCallback((menuItem: MenuItem, existingCartItem?: CartItem) => {
    if (existingCartItem && user?.role === 'waiter' && existingCartItem.status && ['preparing', 'ready', 'served'].includes(existingCartItem.status)) {
      error('Cannot modify options for items already being prepared or served in the kitchen.');
      return;
    }
    setPosCustomizingItem({ menuItem, cartItemId: existingCartItem?.id });
    setPosSpiceLevel(existingCartItem?.spiceLevel || '2 - Medium (中辛)');
    setPosDrinkOption(existingCartItem?.selectedDrink || 'Mango Lassi (マンゴーラッシー)');
    setPosNotes(existingCartItem?.notes || '');
  }, [user?.role, error]);

  const confirmPosItemOptions = useCallback(() => {
    if (!posCustomizingItem) return;
    const { menuItem, cartItemId } = posCustomizingItem;

    const nameLower = menuItem.name.toLowerCase();
    const isBeverage = nameLower.includes('lassi') || nameLower.includes('chai') || nameLower.includes('juice') || nameLower.includes('beer') || nameLower.includes('soda') || nameLower.includes('tea') || nameLower.includes('water');
    const spiceVal = !isBeverage ? posSpiceLevel : undefined;
    const drinkVal = (nameLower.includes('set') || nameLower.includes('セット') || menuItem.includesDrink) ? posDrinkOption : undefined;
    const notesVal = posNotes.trim() || undefined;

    setCart((prev) => {
      if (cartItemId) {
        return prev.map((it) =>
          it.id === cartItemId
            ? {
                ...it,
                spiceLevel: spiceVal,
                selectedDrink: drinkVal,
                notes: notesVal,
              }
            : it
        );
      }

      const newItem: CartItem = {
        id: uuidv4(),
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        quantity: 1,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price,
        spiceLevel: spiceVal,
        selectedDrink: drinkVal,
        notes: notesVal,
        status: 'pending',
        menuItem,
      };

      return [...prev, newItem];
    });

    setPosCustomizingItem(null);
  }, [posCustomizingItem, posDrinkOption, posNotes, posSpiceLevel]);

  // Add item to cart (opens options modal for customization)
  const addToCart = useCallback((menuItem: MenuItem) => {
    openPosItemModal(menuItem);
  }, [openPosItemModal]);

  // Update quantity
  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setCart(prev => {
      const targetItem = prev.find(item => item.id === itemId);
      if (targetItem && user?.role === 'waiter' && targetItem.status && ['preparing', 'ready', 'served'].includes(targetItem.status)) {
        error('Cannot change quantity for items already being prepared or served in the kitchen.');
        return prev;
      }
      return prev.map(item => {
        if (item.id !== itemId) return item;
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty === 0) return item;
        return {
          ...item,
          quantity: newQty,
          totalPrice: newQty * item.unitPrice
        };
      }).filter(item => item.quantity > 0);
    });
  }, [user?.role, error]);

  // Remove item
  const removeItem = useCallback((itemId: string) => {
    setCart(prev => {
      const targetItem = prev.find(item => item.id === itemId);
      if (targetItem && user?.role === 'waiter' && targetItem.status && ['preparing', 'ready', 'served'].includes(targetItem.status)) {
        error('Cannot remove items already being prepared or served in the kitchen.');
        return prev;
      }
      return prev.filter(item => item.id !== itemId);
    });
  }, [user?.role, error]);

  // Handle barcode scan
  const handleBarcodeInput = useCallback((barcode: string) => {
    const item = menuItemDB.getByBarcode(barcode);
    if (item && item.isAvailable) {
      addToCart(item);
      setSearchQuery('');
      success(`Added ${item.name} to cart`);
    }
  }, [addToCart, success]);

  // Send order to Kitchen Display
  const executeSendToKitchen = (tableToUse?: Table | null) => {
    if (cart.length === 0) {
      error('Cart is empty');
      return;
    }

    const effectiveTable = tableToUse || selectedTable;
    if (orderType === 'dine-in' && !effectiveTable) {
      setPendingTableAction('kitchen');
      setShowTableModal(true);
      return;
    }

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
      status: item.status || 'pending',
    }));

    if (loadedOrderId) {
      const existing = orderDB.getById(loadedOrderId);
      if (!existing || existing.status === 'completed' || existing.status === 'cancelled') {
        error('Cannot update an already completed or cancelled order.');
        clearCart();
        return;
      }

      orderDB.update(loadedOrderId, {
        items: orderItems,
        subtotal,
        tax: taxAmount,
        discount: discountAmount,
        total,
        notes: orderNotes.trim() || undefined,
      });
      success(`Updated Table ${effectiveTable?.number || 'Order'} on Kitchen Display!`);
    } else {
      const order = orderDB.create({
        tableId: effectiveTable?.id,
        tableNumber: effectiveTable?.number,
        type: orderType,
        items: orderItems,
        subtotal,
        tax: taxAmount,
        discount: discountAmount,
        discountType,
        total,
        status: 'active',
        paymentStatus: 'pending',
        isPaid: false,
        customerName: customerName || (effectiveTable ? `Table ${effectiveTable.number}` : undefined),
        customerPhone: customerPhone || undefined,
        waiterId: user?.id,
        waiterName: user?.username,
        notes: orderNotes.trim() || undefined,
      });

      notificationDB.create({
        type: 'order',
        title: '👨‍🍳 Order Sent to Kitchen',
        message: `Order #${order.orderNumber} sent to kitchen display.`
      });

      success(`Order #${order.orderNumber} placed and sent to Kitchen!`);
    }

    clearCart();
    setMobileView('menu');
  };

  const handleSendToKitchen = () => {
    executeSendToKitchen();
  };

  // Process payment
  const processPayment = async () => {
    if (isProcessing) return;

    if (cart.length === 0) {
      error('Cart is empty');
      return;
    }

    if (orderType === 'dine-in' && !selectedTable) {
      setShowPaymentModal(false);
      setShowTableModal(true);
      return;
    }

    if (paymentMethod === 'cash' && Number(cashReceived) < total) {
      error('Insufficient cash received');
      return;
    }

    setIsProcessing(true);

    try {
      if (loadedOrderId) {
        // Prevent double payment if order was already completed
        const latestOrder = orderDB.getById(loadedOrderId);
        if (!latestOrder || latestOrder.status === 'completed') {
          error(`Order #${latestOrder?.orderNumber || loadedOrderId} has already been paid and settled!`);
          setShowPaymentModal(false);
          clearCart();
          return;
        }

        const isAllItemsServed = cart.every((i) => i.status === 'served');
        const nextStatus = isAllItemsServed ? 'completed' : (latestOrder.status || 'active');

        // Complete/Update existing table order
        const updated = orderDB.update(loadedOrderId, {
          status: nextStatus,
          paymentStatus: 'paid',
          isPaid: true,
          completedAt: isAllItemsServed ? new Date().toISOString() : undefined,
          subtotal,
          tax: taxAmount,
          discount: discountAmount,
          total,
          notes: orderNotes.trim() || undefined,
          items: cart.map((item) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            spiceLevel: item.spiceLevel,
            selectedDrink: item.selectedDrink,
            notes: item.notes,
            status: item.status || 'pending',
          })),
        });

        const payRecord = paymentDB.create({
          orderId: loadedOrderId,
          orderNumber: updated?.orderNumber || 'POS-PAY',
          amount: total,
          method: paymentMethod,
          status: 'completed',
          receivedBy: user?.username || 'Cashier',
        });

        if (isAllItemsServed) {
          const targetTableId = selectedTable?.id || updated?.tableId;
          if (targetTableId) {
            tableDB.update(targetTableId, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
          } else if (updated?.tableNumber) {
            const tbl = tableDB.getByNumber(updated.tableNumber);
            if (tbl) tableDB.update(tbl.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
          }
          success(`Payment of ${formatCurrency(total)} received! Table ${selectedTable?.number || updated?.tableNumber || 'N/A'} is now AVAILABLE ✅`);
        } else {
          success(`Payment of ${formatCurrency(total)} received! Order remaining in Kitchen Display until fully served.`);
        }

        setPaymentSuccessData({ order: updated || latestOrder, payment: payRecord });
      } else {
        // Create new POS order with distinct order number (Upfront Payment)
        const newOrderNum = orderDB.generateOrderNumber('pos', selectedTable?.number);

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
          status: 'pending', // Kitchen cooks and serves!
        }));

        const order = orderDB.create({
          tableId: selectedTable?.id,
          tableNumber: selectedTable?.number,
          type: orderType,
          items: orderItems,
          subtotal,
          tax: taxAmount,
          discount: discountAmount,
          discountType,
          total,
          status: 'active', // Active in Kitchen Display and Orders Dashboard!
          paymentStatus: 'paid',
          isPaid: true,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          waiterId: user?.id,
          waiterName: user?.username,
          orderNumber: newOrderNum,
          notes: orderNotes.trim() || undefined,
        } as any);

        const payment = paymentDB.create({
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: total,
          method: paymentMethod,
          status: 'completed',
          receivedBy: user?.username || 'Cashier',
        });

        notificationDB.create({
          type: 'order',
          title: `👨‍🍳 New Order #${order.orderNumber} (Paid)`,
          message: `Order #${order.orderNumber} sent to Kitchen Display for preparation.`,
        });

        success(`POS Order ${order.orderNumber} paid! Sent to Kitchen Display & Orders Dashboard.`);
        setPaymentSuccessData({ order, payment });
      }

      setShowPaymentModal(false);
      clearCart();
    } catch (err) {
      error('Failed to process payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        setShowTableModal(true);
      } else if (e.key === 'F3') {
        if (cart.length > 0) {
          if (orderType === 'dine-in' && !selectedTable) {
            setShowTableModal(true);
          } else {
            setShowPaymentModal(true);
          }
        }
      } else if (e.key === 'Escape') {
        setShowPaymentModal(false);
        setShowTableModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, orderType, selectedTable]);

  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  return (
    <div className="h-[calc(100dvh-10.5rem)] lg:h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-3 lg:gap-4 relative pb-2 lg:pb-0">
      {/* Mobile / Tablet Segmented View Switcher */}
      <div className="lg:hidden flex items-center gap-1.5 p-1 bg-gray-200/80 dark:bg-gray-800/80 rounded-xl shrink-0">
        <button
          type="button"
          onClick={() => setMobileView('menu')}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer',
            mobileView === 'menu'
              ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
          )}
        >
          <span>🍽️ Menu ({menuItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileView('cart')}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 relative cursor-pointer',
            mobileView === 'cart'
              ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
          )}
        >
          <ShoppingCart size={14} />
          <span>Order</span>
          {cartItemCount > 0 && (
            <span className="rounded-full bg-blue-600 text-white text-[10px] font-black px-1.5 py-0.2">
              {cartItemCount}
            </span>
          )}
          {total > 0 && (
            <span className="font-extrabold text-blue-600 dark:text-blue-400">
              {formatCurrency(total)}
            </span>
          )}
        </button>
      </div>

      {/* Left Panel - Menu Items */}
      <div className={cn('flex-1 flex-col min-w-0 overflow-hidden', mobileView === 'menu' ? 'flex' : 'hidden lg:flex')}>
        {/* Search & Categories */}
        <div className="mb-4 space-y-3">
          {/* Active Table Bills Quick Bar */}
          {activeTableOrders.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar bg-amber-50 dark:bg-amber-950/30 p-2 rounded-xl border border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-200 shrink-0 uppercase tracking-wider">
                <Table2 size={15} />
                <span>Active Table Bills ({activeTableOrders.length}):</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {activeTableOrders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => loadActiveOrder(ord)}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer',
                      loadedOrderId === ord.id
                        ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                        : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100 dark:bg-gray-800 dark:border-amber-900/50 dark:text-amber-200'
                    )}
                  >
                    <span>Table {ord.tableNumber || 'Takeaway'}</span>
                    <span className="rounded bg-amber-900/10 dark:bg-amber-100/10 px-1.5 py-0.5 text-[11px] font-extrabold">
                      {formatCurrency(ord.total)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search items or scan barcode..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // Check if it's a barcode
                  if (e.target.value.length >= 6) {
                    handleBarcodeInput(e.target.value);
                  }
                }}
                leftIcon={<Search size={18} />}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={orderType === 'dine-in' ? 'primary' : 'outline'}
                onClick={() => {
                  setOrderType('dine-in');
                  if (!selectedTable) {
                    setShowTableModal(true);
                  }
                }}
                leftIcon={<Table2 size={18} />}
              >
                {selectedTable ? `Table ${selectedTable.number}` : 'Dine-in'}
              </Button>
              <Button
                variant={orderType === 'takeaway' ? 'primary' : 'outline'}
                onClick={() => setOrderType('takeaway')}
                leftIcon={<Package size={18} />}
              >
                Takeaway
              </Button>
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                !selectedCategory
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              All Items
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {menuItems.map(item => (
              <Card
                key={item.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                padding="sm"
                onClick={() => addToCart(item)}
              >
                <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{item.isVeg ? '🥬' : '🍖'}</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white truncate">
                      {item.name}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <span className={cn(
                    'w-3 h-3 rounded-sm flex-shrink-0 mt-1',
                    item.isVeg ? 'bg-green-500' : 'bg-red-500'
                  )} />
                </div>
              </Card>
            ))}
          </div>
          
          {menuItems.length === 0 && (
            <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Cart */}
      <div
        className={cn(
          'w-full lg:w-96 flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shrink-0 shadow-xs overflow-hidden',
          mobileView === 'cart' ? 'flex' : 'hidden lg:flex'
        )}
      >
        {/* Mobile back to menu bar */}
        <div className="lg:hidden px-3 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileView('menu')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
          >
            ← Add More Items (Menu)
          </button>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            {selectedTable ? `Table ${selectedTable.number}` : 'Takeaway'}
          </span>
        </div>
        {/* Cart Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ShoppingCart size={20} />
              Current Order
            </h3>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart}>
                Clear
              </Button>
            )}
          </div>
          
          {/* Table/Customer Info */}
          <div className="flex gap-2">
            {orderType === 'dine-in' && (
              <button
                onClick={() => setShowTableModal(true)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                  selectedTable
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                )}
              >
                <Table2 size={16} className="inline mr-1" />
                {selectedTable ? `Table ${selectedTable.number}` : 'Select Table (F2)'}
              </button>
            )}
            <button
              onClick={() => {
                const name = prompt('Customer Name:', customerName);
                if (name !== null) setCustomerName(name);
              }}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors truncate"
            >
              <User size={16} className="inline mr-1" />
              {customerName || 'Guest'}
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingCart size={48} className="mb-2 opacity-50" />
              <p>Cart is empty</p>
              <p className="text-sm">Add items to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {item.menuItemName}
                      </p>
                      {item.status && item.status !== 'pending' && (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0',
                            item.status === 'served' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
                            item.status === 'ready' && 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
                            item.status === 'preparing' && 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                          )}
                        >
                          {item.status === 'served' ? '🍽️ Served' : item.status === 'ready' ? '✅ Ready' : '🍳 Preparing'}
                        </span>
                      )}
                    </div>
                    {(item.spiceLevel || item.selectedDrink || item.notes) && (
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.spiceLevel && <span className="font-bold text-rose-600 dark:text-rose-400">🌶️ {item.spiceLevel}</span>}
                        {item.selectedDrink && <span className="font-bold text-blue-600 dark:text-blue-400">🥤 {item.selectedDrink}</span>}
                        {item.notes && <span className="italic">({item.notes})</span>}
                      </div>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {settings.currencySymbol}{item.unitPrice.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  {(() => {
                    const isWaiter = user?.role === 'waiter';
                    const isItemLocked = isWaiter && Boolean(item.status && ['preparing', 'ready', 'served'].includes(item.status));

                    if (isItemLocked) {
                      return (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-xs px-2 py-1 font-semibold"
                            title="Item is already preparing or served in the kitchen. Waiters cannot modify or remove it."
                          >
                            <Lock size={12} /> In Kitchen
                          </span>
                          <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
                            {item.quantity}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPosItemModal(item.menuItem, item)}
                          className="w-7 h-7 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          title="Edit Spice / Drink / Notes"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="w-7 h-7 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })()}
                  <p className="w-16 text-right font-semibold text-gray-900 dark:text-white">
                    {settings.currencySymbol}{item.totalPrice.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 space-y-2.5 sm:space-y-3 bg-gray-50 dark:bg-gray-800/50 pb-4 lg:pb-4">
            {/* Discount */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  placeholder="Discount"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  leftIcon={discountType === 'percentage' ? <Percent size={16} /> : <DollarSign size={16} />}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setDiscountType(discountType === 'percentage' ? 'fixed' : 'percentage')}
              >
                {discountType === 'percentage' ? '%' : settings.currencySymbol}
              </Button>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Tax ({settings.taxPercentage}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-600">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Entire Order Notes / Special Instructions */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <span>📝 Entire Order Request (Optional):</span>
              </label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Serve appetizers first, extra napkins..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Print Current Bill / Ticket */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs text-gray-700 dark:text-gray-300"
              onClick={() => {
                const tempOrder: Order = loadedOrder || {
                  id: loadedOrderId || uuidv4(),
                  orderNumber: loadedOrder?.orderNumber || orderDB.generateOrderNumber(orderType, selectedTable?.number),
                  tableId: selectedTable?.id,
                  tableNumber: selectedTable?.number,
                  type: orderType,
                  items: cart,
                  subtotal,
                  tax: taxAmount,
                  discount: discountAmount,
                  discountType,
                  total,
                  status: loadedOrder?.status || 'active',
                  customerName: customerName || undefined,
                  customerPhone: customerPhone || undefined,
                  createdAt: loadedOrder?.createdAt || new Date().toISOString(),
                  notes: orderNotes || undefined,
                };
                printInvoice(tempOrder);
              }}
              leftIcon={<Printer size={14} />}
            >
              Print Receipt / Bill Ticket
            </Button>

            {/* Actions: Send to Kitchen or Pay */}
            {isAlreadySentToKitchen ? (
              <div className="space-y-2 pt-1">
                {loadedOrder && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 p-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1.5">
                    {loadedOrder.status === 'served' ? (
                      <span>🍽️ All Items Served • Ready for Payment Settlement</span>
                    ) : loadedOrder.status === 'ready' ? (
                      <span>✅ All Items Ready • Ready for Payment Settlement</span>
                    ) : (
                      <span>🍳 In Kitchen ({loadedOrder.status}) • Ready for Payment</span>
                    )}
                  </div>
                )}
                <Button
                  variant="primary"
                  className="w-full font-bold shadow-md py-3 text-base"
                  onClick={() => {
                    if (orderType === 'dine-in' && !selectedTable) {
                      setPendingTableAction('pay');
                      setShowTableModal(true);
                      return;
                    }
                    setShowPaymentModal(true);
                  }}
                  leftIcon={<CreditCard size={20} />}
                >
                  Pay {formatCurrency(total)} (F3)
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="outline"
                  className="border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-bold"
                  onClick={handleSendToKitchen}
                  leftIcon={<ChefHat size={18} className="text-amber-600" />}
                >
                  {loadedOrderId ? 'To Kitchen (New)' : 'To Kitchen'}
                </Button>
                <Button
                  variant="primary"
                  className="font-bold shadow-md"
                  onClick={() => {
                    if (orderType === 'dine-in' && !selectedTable) {
                      setPendingTableAction('pay');
                      setShowTableModal(true);
                      return;
                    }
                    setShowPaymentModal(true);
                  }}
                  leftIcon={<CreditCard size={18} />}
                >
                  Pay (F3)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Summary Bar */}
      {mobileView === 'menu' && cart.length > 0 && (
        <div className="lg:hidden fixed bottom-20 left-3 right-3 z-30 bg-gray-900/95 dark:bg-gray-800/95 text-white backdrop-blur-md rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-gray-700/50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-sm text-white shadow-xs">
              {cartItemCount}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-300">
                {selectedTable ? `Table ${selectedTable.number}` : 'Takeaway Order'}
              </p>
              <p className="text-base font-black text-white">{formatCurrency(total)}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            className="bg-blue-600 hover:bg-blue-500 font-bold px-4 shadow-md text-white"
            onClick={() => setMobileView('cart')}
            rightIcon={<ShoppingCart size={16} />}
          >
            Review Order
          </Button>
        </div>
      )}

      {/* Table Selection Modal */}
      <Modal
        isOpen={showTableModal}
        onClose={() => {
          setShowTableModal(false);
          setPendingTableAction(null);
        }}
        title="Select Table"
        size="lg"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tables.map((table) => {
            const activeOrd = activeTableOrders.find((o) => o.tableNumber === table.number || o.tableId === table.id);
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => {
                  if (table.status === 'cleaning') {
                    if (window.confirm(`Table ${table.number} is marked as Cleaning. Mark it Ready (Available) and select it?`)) {
                      tableDB.update(table.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
                      const updatedTable = { ...table, status: 'available' as const };
                      setSelectedTable(updatedTable);
                      setLoadedOrderId(null);
                      setShowTableModal(false);
                      if (pendingTableAction === 'kitchen') {
                        setPendingTableAction(null);
                        executeSendToKitchen(updatedTable);
                      } else if (pendingTableAction === 'pay') {
                        setPendingTableAction(null);
                        setShowPaymentModal(true);
                      } else {
                        success(`Table ${table.number} is now Available and selected!`);
                      }
                    }
                    return;
                  }
                  if (table.status === 'occupied' && !activeOrd) {
                    if (window.confirm(`Table ${table.number} is marked occupied but has no active order. Reset to Available and select?`)) {
                      tableDB.update(table.id, { status: 'available', currentOrderId: undefined, reservationInfo: undefined });
                      const updatedTable = { ...table, status: 'available' as const };
                      setSelectedTable(updatedTable);
                      setLoadedOrderId(null);
                      setShowTableModal(false);
                      if (pendingTableAction === 'kitchen') {
                        setPendingTableAction(null);
                        executeSendToKitchen(updatedTable);
                      } else if (pendingTableAction === 'pay') {
                        setPendingTableAction(null);
                        setShowPaymentModal(true);
                      } else {
                        success(`Table ${table.number} reset to Available and selected!`);
                      }
                    }
                    return;
                  }
                  if (activeOrd) {
                    if (pendingTableAction === 'kitchen' && cart.length > 0 && !loadedOrderId) {
                      if (window.confirm(`Table ${table.number} already has active order #${activeOrd.orderNumber}. Add these ${cart.length} item(s) to the existing order in the kitchen?`)) {
                        setSelectedTable(table);
                        setShowTableModal(false);
                        setPendingTableAction(null);
                        const appendedItems: OrderItem[] = [
                          ...activeOrd.items,
                          ...cart.map((item) => ({
                            id: item.id,
                            menuItemId: item.menuItemId,
                            menuItemName: item.menuItemName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalPrice: item.totalPrice,
                            spiceLevel: item.spiceLevel,
                            selectedDrink: item.selectedDrink,
                            notes: item.notes,
                            status: item.status || ('pending' as const),
                          })),
                        ];
                        const newSubtotal = appendedItems.reduce((sum, it) => sum + it.totalPrice, 0);
                        const newTax = Math.round(newSubtotal * 0.10);
                        const newTotal = newSubtotal + newTax - (activeOrd.discount || 0);
                        orderDB.update(activeOrd.id, {
                          items: appendedItems,
                          subtotal: newSubtotal,
                          tax: newTax,
                          total: newTotal,
                        });
                        notificationDB.create({
                          type: 'order',
                          title: '👨‍🍳 Items Added to Kitchen Order',
                          message: `Added ${cart.length} item(s) to Table ${table.number} (Order #${activeOrd.orderNumber}).`
                        });
                        success(`Added ${cart.length} item(s) to Table ${table.number} and sent to Kitchen!`);
                        clearCart();
                        setMobileView('menu');
                        return;
                      }
                    }
                    loadActiveOrder(activeOrd);
                    setShowTableModal(false);
                    setPendingTableAction(null);
                  } else {
                    setSelectedTable(table);
                    setLoadedOrderId(null);
                    setShowTableModal(false);
                    if (pendingTableAction === 'kitchen') {
                      setPendingTableAction(null);
                      executeSendToKitchen(table);
                    } else if (pendingTableAction === 'pay') {
                      setPendingTableAction(null);
                      setShowPaymentModal(true);
                    }
                  }
                }}
                className={cn(
                  'aspect-square rounded-xl flex flex-col items-center justify-center p-3 transition-all cursor-pointer border text-center space-y-1',
                  table.status === 'available' && 'bg-green-50 border-green-200 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100',
                  table.status === 'occupied' && 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 hover:bg-amber-100 ring-2 ring-amber-400/50',
                  table.status === 'reserved' && 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
                  table.status === 'cleaning' && 'bg-purple-50 border-purple-300 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 hover:bg-purple-100 ring-2 ring-purple-400/50',
                  selectedTable?.id === table.id && 'ring-2 ring-blue-600 font-bold'
                )}
              >
                <span className="text-xl font-bold block">Table {table.number}</span>
                <span className="text-xs text-gray-500 block">{table.capacity} seats</span>
                <div className="pt-0.5">
                  <StatusBadge status={table.status} showDot={false} />
                </div>
                {table.status === 'cleaning' && (
                  <span className="inline-flex items-center gap-1 mt-1 rounded-lg bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                    🧹 Tap to Ready
                  </span>
                )}
                {(() => {
                  const tableWaiterCall = notifications.find(
                    (n) => !n.isRead && n.type === 'table' && n.title.includes(`Table ${table.number}`)
                  );
                  if (tableWaiterCall) {
                    return (
                      <span className="inline-flex items-center gap-1 mt-1 rounded-lg bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs animate-bounce">
                        <BellRing size={10} /> Waiter Call!
                      </span>
                    );
                  }
                  if (activeOrd) {
                    return (
                      <span className="inline-block mt-1 rounded-lg bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        Pay {formatCurrency(activeOrd.total)} 💳
                      </span>
                    );
                  }
                  return null;
                })()}
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Complete Payment"
        size="md"
      >
        <div className="space-y-4">
          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'cash' as const, label: 'Cash', icon: <Banknote size={24} /> },
                { id: 'card' as const, label: 'Card', icon: <CreditCard size={24} /> },
                { id: 'upi' as const, label: 'UPI', icon: <Smartphone size={24} /> }
              ].map(method => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    'p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all',
                    paymentMethod === method.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                  )}
                >
                  {method.icon}
                  <span className="text-sm font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cash Input */}
          {paymentMethod === 'cash' && (
            <div>
              <Input
                label="Cash Received"
                type="number"
                placeholder="Enter amount"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                leftIcon={<Banknote size={18} />}
              />
              {Number(cashReceived) >= total && (
                <p className="mt-2 text-green-600 dark:text-green-400 font-medium">
                  Change: {settings.currencySymbol}{change.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Order Summary */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Items</span>
              <span className="font-medium text-gray-900 dark:text-white">{cart.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Order Type</span>
              <span className="font-medium text-gray-900 dark:text-white capitalize">{orderType}</span>
            </div>
            {selectedTable && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Table</span>
                <span className="font-medium text-gray-900 dark:text-white">#{selectedTable.number}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-900 dark:text-white">Total</span>
              <span className="text-blue-600 dark:text-blue-400">
                {settings.currencySymbol}{total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowPaymentModal(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={processPayment}
              isLoading={isProcessing}
              disabled={paymentMethod === 'cash' && Number(cashReceived) < total}
              leftIcon={<Check size={20} />}
            >
              Complete Payment
            </Button>
          </div>
        </div>
      </Modal>

      {/* POS Item Options Modal */}
      {posCustomizingItem && (
        <Modal
          isOpen={!!posCustomizingItem}
          onClose={() => setPosCustomizingItem(null)}
          title={`Customize Item: ${posCustomizingItem.menuItem.name}`}
          size="md"
        >
          <div className="space-y-4">
            {/* 5-Stage Spice Level */}
            {!posCustomizingItem.menuItem.name.toLowerCase().includes('lassi') &&
             !posCustomizingItem.menuItem.name.toLowerCase().includes('chai') &&
             !posCustomizingItem.menuItem.name.toLowerCase().includes('beer') && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  🌶️ Select Spice Level (5 Stages)
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {SPICE_LEVELS.map((lvl, idx) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setPosSpiceLevel(lvl.id)}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-xl p-2 text-center text-xs font-bold border transition-all cursor-pointer',
                        posSpiceLevel === lvl.id
                          ? 'bg-rose-600 text-white border-rose-700 shadow-md scale-105'
                          : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
                      )}
                    >
                      <span>{lvl.icon}</span>
                      <span className="text-[10px] mt-0.5">{idx + 1}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-rose-600 font-semibold">{posSpiceLevel}</p>
              </div>
            )}

            {/* Drink Choice if set meal */}
            {(posCustomizingItem.menuItem.name.toLowerCase().includes('set') ||
              posCustomizingItem.menuItem.name.toLowerCase().includes('セット') ||
              posCustomizingItem.menuItem.includesDrink) && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  🥤 Select Included Drink
                </label>
                <select
                  value={posDrinkOption}
                  onChange={(e) => setPosDrinkOption(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-2.5 text-sm font-semibold dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                >
                  {DRINK_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Special Instructions / Chef Note */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                📝 Special Instructions / Note for Chef
              </label>
              <textarea
                rows={2}
                value={posNotes}
                onChange={(e) => setPosNotes(e.target.value)}
                placeholder="e.g. Extra spicy, no garlic, less oil, etc."
                className="w-full rounded-xl border border-gray-300 p-2.5 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setPosCustomizingItem(null)}>
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" onClick={confirmPosItemOptions}>
                Confirm & Add to Order
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment Completed Modal with optional Print Receipt button */}
      {paymentSuccessData && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentSuccessData(null)}
          title="Payment Successful ✅"
          size="sm"
        >
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Check size={30} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(paymentSuccessData.payment.amount)}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Order #{paymentSuccessData.order.orderNumber} • Paid via {paymentSuccessData.payment.method.toUpperCase()}
              </p>
            </div>

            <div className="flex gap-2 pt-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  printInvoice(paymentSuccessData.order, paymentSuccessData.payment);
                }}
                leftIcon={<Printer size={16} />}
              >
                Print Receipt
              </Button>
              <Button
                variant="primary"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={() => setPaymentSuccessData(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

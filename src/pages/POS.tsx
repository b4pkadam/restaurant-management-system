import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Plus, Minus, Trash2, Search, ShoppingCart, CreditCard, Banknote,
  Smartphone, User, Table2, Package, Check, Percent, DollarSign
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
import type { MenuItem, OrderItem, Table } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency } from '../utils/formatCurrency';

interface CartItem extends OrderItem {
  menuItem: MenuItem;
}

export const POSPage: React.FC = () => {
  useDbUpdate();
  const { user } = useAuth();
  const { success, error } = useToast();
  const settings = settingsDB.get();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const categories = useMemo(() => categoryDB.getAll().filter(c => c.isActive), []);
  const tables = useMemo(() => tableDB.getAll(), []);
  
  const menuItems = useMemo(() => {
    let items = menuItemDB.getAll().filter(m => m.isAvailable);
    
    if (selectedCategory) {
      items = items.filter(m => m.categoryId === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(m => 
        m.name.toLowerCase().includes(query) ||
        m.barcode?.toLowerCase() === query
      );
    }
    
    return items;
  }, [selectedCategory, searchQuery]);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = discountType === 'percentage' 
    ? (subtotal * discount / 100) 
    : discount;
  const taxAmount = (subtotal - discountAmount) * (settings.taxPercentage / 100);
  const total = subtotal - discountAmount + taxAmount;
  const change = paymentMethod === 'cash' ? Number(cashReceived) - total : 0;

  // Add item to cart
  const addToCart = useCallback((menuItem: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(item => item.menuItemId === menuItem.id);
      if (existing) {
        return prev.map(item => 
          item.menuItemId === menuItem.id
            ? { 
                ...item, 
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice
              }
            : item
        );
      }
      
      const newItem: CartItem = {
        id: uuidv4(),
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        quantity: 1,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price,
        status: 'pending',
        menuItem
      };
      
      return [...prev, newItem];
    });
  }, []);

  // Update quantity
  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setCart(prev => {
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
  }, []);

  // Remove item
  const removeItem = useCallback((itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // Clear cart
  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedTable(null);
    setCustomerName('');
    setCustomerPhone('');
    setDiscount(0);
  }, []);

  // Handle barcode scan
  const handleBarcodeInput = useCallback((barcode: string) => {
    const item = menuItemDB.getByBarcode(barcode);
    if (item && item.isAvailable) {
      addToCart(item);
      setSearchQuery('');
      success(`Added ${item.name} to cart`);
    }
  }, [addToCart, success]);

  // Process payment
  const processPayment = async () => {
    if (cart.length === 0) {
      error('Cart is empty');
      return;
    }

    if (orderType === 'dine-in' && !selectedTable) {
      error('Please select a table for dine-in orders');
      return;
    }

    if (paymentMethod === 'cash' && Number(cashReceived) < total) {
      error('Insufficient cash received');
      return;
    }

    setIsProcessing(true);

    try {
      // Create order
      const orderItems: OrderItem[] = cart.map(item => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        status: 'pending'
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
        status: 'active',
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        waiterId: user?.id,
        waiterName: user?.username
      });

      // Record payment while keeping the order active for kitchen/order workflow.
      paymentDB.create({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: total,
        method: paymentMethod,
        status: 'completed',
        receivedBy: user?.username || 'Unknown'
      });

      // Notification
      notificationDB.create({
        type: 'order',
        title: 'New Order',
        message: `Order ${order.orderNumber} has been placed (${settings.currencySymbol}${total.toFixed(2)}) and sent to the kitchen.`
      });

      success(`Order ${order.orderNumber} created successfully and sent to kitchen.`);
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
        if (cart.length > 0) setShowPaymentModal(true);
      } else if (e.key === 'Escape') {
        setShowPaymentModal(false);
        setShowTableModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length]);

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Left Panel - Menu Items */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search & Categories */}
        <div className="mb-4 space-y-3">
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
                onClick={() => setOrderType('dine-in')}
                leftIcon={<Table2 size={18} />}
              >
                Dine-in
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
      <div className="w-96 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
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
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {item.menuItemName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {settings.currencySymbol}{item.unitPrice.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
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

            {/* Pay Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => setShowPaymentModal(true)}
              leftIcon={<CreditCard size={20} />}
            >
              Pay {formatCurrency(total)} (F3)
            </Button>
          </div>
        )}
      </div>

      {/* Table Selection Modal */}
      <Modal
        isOpen={showTableModal}
        onClose={() => setShowTableModal(false)}
        title="Select Table"
        size="lg"
      >
        <div className="grid grid-cols-4 gap-3">
          {tables.map(table => (
            <button
              key={table.id}
              onClick={() => {
                if (table.status === 'available') {
                  setSelectedTable(table);
                  setShowTableModal(false);
                }
              }}
              disabled={table.status !== 'available'}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center transition-all',
                table.status === 'available' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50',
                table.status === 'occupied' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 cursor-not-allowed opacity-60',
                table.status === 'reserved' && 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 cursor-not-allowed opacity-60',
                selectedTable?.id === table.id && 'ring-2 ring-blue-500'
              )}
            >
              <span className="text-2xl font-bold">{table.number}</span>
              <span className="text-xs">{table.capacity} seats</span>
              <StatusBadge status={table.status} showDot={false} />
            </button>
          ))}
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
    </div>
  );
};

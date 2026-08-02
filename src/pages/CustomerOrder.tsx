import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  X,
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
import type { MenuItem, OrderItem } from '../types';

interface CartItem extends OrderItem {
  menuItem: MenuItem;
}

interface CustomerOrderPageProps {
  tableNumber: number;
  onExit: () => void;
}

export function CustomerOrderPage({ tableNumber, onExit }: CustomerOrderPageProps) {
  const settings = settingsDB.get();
  const table = tableDB.getAll().find((t) => t.number === tableNumber);
  const categories = useMemo(() => categoryDB.getAll().filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), []);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);

  const menuItems = useMemo(() => {
    let items = menuItemDB.getAll().filter((m) => m.isAvailable);
    if (selectedCategory) items = items.filter((m) => m.categoryId === selectedCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q));
    }
    return items;
  }, [selectedCategory, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = subtotal * (settings.taxPercentage / 100);
  const total = subtotal + tax;

  const addToCart = useCallback((menuItem: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menuItemId === menuItem.id);
      if (existing) {
        return prev.map((item) =>
          item.menuItemId === menuItem.id
            ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
            : item
        );
      }
      return [
        ...prev,
        {
          id: uuidv4(),
          menuItemId: menuItem.id,
          menuItemName: menuItem.name,
          quantity: 1,
          unitPrice: menuItem.price,
          totalPrice: menuItem.price,
          status: 'pending' as const,
          menuItem,
        },
      ];
    });
  }, []);

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
    if (!customerName.trim()) {
      setShowNameModal(true);
      return;
    }

    const orderItems: OrderItem[] = cart.map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
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
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      notes: `QR Order from Table ${tableNumber}`,
    });

    notificationDB.create({
      type: 'order',
      title: '📱 New QR Order!',
      message: `Table ${tableNumber} placed order ${order.orderNumber} via QR code (${settings.currencySymbol}${total.toFixed(2)})`,
    });

    setPlacedOrderNumber(order.orderNumber);
    setOrderPlaced(true);
    setCart([]);
    setShowCart(false);
  };

  // Order success screen
  if (orderPlaced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-500 shadow-lg shadow-green-200">
            <Check className="h-12 w-12 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Order Placed!</h1>
          <p className="text-lg text-gray-600">Your order <strong className="text-green-700">{placedOrderNumber}</strong> has been sent to the kitchen.</p>
          <div className="rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-center gap-3 text-gray-500">
              <Clock size={20} />
              <span>Table {tableNumber}</span>
            </div>
            <p className="mt-3 text-sm text-gray-500">Our kitchen team is preparing your food now. Please sit back and relax!</p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setOrderPlaced(false);
                setPlacedOrderNumber('');
              }}
              className="w-full rounded-xl bg-green-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700 active:scale-95"
            >
              Order More Items
            </button>
            <button onClick={onExit} className="text-sm text-gray-500 hover:text-gray-700">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={onExit} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{settings.restaurantName}</h1>
              <p className="text-xs text-gray-500">Table {tableNumber} • Digital Menu</p>
            </div>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative rounded-xl bg-blue-600 p-2.5 text-white shadow transition hover:bg-blue-700 active:scale-95"
          >
            <ShoppingCart size={22} />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search dishes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Category Chips */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition',
              !selectedCategory ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition whitespace-nowrap',
                selectedCategory === cat.id ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              )}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {menuItems.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <UtensilsCrossed size={48} className="mx-auto mb-3 opacity-40" />
            <p>No dishes found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {menuItems.map((item) => {
              const inCart = cart.find((c) => c.menuItemId === item.id);
              return (
                <div key={item.id} className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                  {/* Image */}
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-3xl">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      item.isVeg ? '🥬' : '🍖'
                    )}
                  </div>
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description || 'Delicious dish prepared fresh.'}</p>
                      </div>
                      <span className={cn('mt-0.5 h-3 w-3 flex-shrink-0 rounded-sm', item.isVeg ? 'bg-green-500' : 'bg-red-500')} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-lg font-bold text-gray-900">
                        {settings.currencySymbol}{item.price.toFixed(2)}
                      </p>
                      {inCart ? (
                        <div className="flex items-center gap-2 rounded-full bg-blue-50 px-1">
                          <button
                            onClick={() => updateQty(inCart.id, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition active:scale-90"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center font-bold text-blue-700">{inCart.quantity}</span>
                          <button
                            onClick={() => updateQty(inCart.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition active:scale-90"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-blue-700 active:scale-95"
                        >
                          <Plus size={16} /> Add
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} />
                      <span>{item.preparationTime} min</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Cart Summary */}
      {cartCount > 0 && !showCart && (
        <div className="sticky bottom-0 z-20 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => setShowCart(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold">{cartCount}</div>
              <span className="font-semibold">View Cart</span>
            </div>
            <span className="text-lg font-bold">{settings.currencySymbol}{total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCart(false)} />
          <div className="relative ml-auto mt-auto flex h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom">
            {/* Cart Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">Your Order</h2>
              <button onClick={() => setShowCart(false)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
                <X size={22} />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <ShoppingCart size={48} className="mx-auto mb-3 opacity-40" />
                  <p>Your cart is empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.menuItemName}</p>
                        <p className="text-sm text-gray-500">
                          {settings.currencySymbol}{item.unitPrice.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300">
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-bold text-gray-900">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => removeItem(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="w-16 text-right font-semibold text-gray-900">{settings.currencySymbol}{item.totalPrice.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className="border-t border-gray-100 px-6 py-4">
                {/* Customer Info */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Your Name *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <input
                    type="tel"
                    placeholder="Phone (optional)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>{settings.currencySymbol}{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax ({settings.taxPercentage}%)</span>
                    <span>{settings.currencySymbol}{tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-100 text-lg font-bold text-gray-900">
                    <span>Total</span>
                    <span>{settings.currencySymbol}{total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={placeOrder}
                  className="mt-4 w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-green-200 transition hover:bg-green-700 active:scale-[0.98]"
                >
                  Place Order • {settings.currencySymbol}{total.toFixed(2)}
                </button>
                <p className="mt-2 text-center text-xs text-gray-400">Payment will be collected at the table after your meal</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNameModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Enter Your Name</h3>
            <p className="text-sm text-gray-500">So we know who this order belongs to.</p>
            <input
              type="text"
              placeholder="Your name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNameModal(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => {
                  if (customerName.trim()) {
                    setShowNameModal(false);
                    placeOrder();
                  }
                }}
                className="flex-1 rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700"
              >
                Confirm & Place Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

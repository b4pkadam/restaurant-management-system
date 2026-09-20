import React, { useMemo } from 'react';
import {
  DollarSign, ShoppingBag, Users, TrendingUp,
  Clock, Printer, AlertTriangle
} from 'lucide-react';
import { Card, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';
import { orderDB, tableDB, analyticsDB, settingsDB, paymentDB, inventoryDB } from '../database/db';
import { cn } from '../utils/cn';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency } from '../utils/formatCurrency';
import { printInvoice } from '../utils/printInvoice';

export const Dashboard: React.FC = () => {
  const tick = useDbUpdate();
  const settings = settingsDB.get();
  const today = new Date().toISOString().split('T')[0];
  
  const todaySales = useMemo(() => analyticsDB.getDailySales(today), [today, tick]);
  const weeklySales = useMemo(() => analyticsDB.getWeeklySales(), [tick]);
  const bestSelling = useMemo(() => analyticsDB.getBestSellingItems(5), [tick]);
  const activeOrders = useMemo(() => orderDB.getActive(), [tick]);
  const tables = useMemo(() => tableDB.getAll(), [tick]);
  const lowStockItems = useMemo(() => inventoryDB.getLowStock(), [tick]);
  
  const occupiedTables = tables.filter(t => t.status === 'occupied').length;
  const availableTables = tables.filter(t => t.status === 'available').length;

  const weeklyChartData = weeklySales.map((day) => {
    let dayName = day.date;
    try {
      const d = new Date(day.date + (day.date.includes('T') ? '' : 'T00:00:00'));
      if (!isNaN(d.getTime())) {
        dayName = format(d, 'EEE');
      }
    } catch {
      // ignore
    }
    return {
      name: dayName,
      revenue: day.totalRevenue || 0,
      orders: day.totalOrders || 0,
    };
  });

  const paymentMethodData = [
    { name: 'Cash', value: todaySales.cashPayments || 0, color: '#10B981' },
    { name: 'Card', value: todaySales.cardPayments || 0, color: '#3B82F6' },
    { name: 'UPI', value: todaySales.upiPayments || 0, color: '#8B5CF6' }
  ].filter(d => d.value > 0);

  const recentOrders = orderDB.getAll()
    .sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
    .slice(0, 5);

  return (
    <div className="space-y-3.5">
      {/* Compact Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-gray-200/80 dark:border-gray-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-tight">
            Dashboard Overview
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Real-time operations, live orders, and daily performance for {settings.restaurantName}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 shadow-2xs">
            <Clock size={13} className="text-gray-400" />
            <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
          </div>
        </div>
      </div>

      {/* Low Stock Alert Strip (Compact & Actionable) */}
      {lowStockItems.length > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/25 p-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white shrink-0 shadow-2xs">
                <AlertTriangle size={15} />
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200 leading-tight">
                  Low Stock Warning ({lowStockItems.length} ingredient{lowStockItems.length > 1 ? 's' : ''})
                </h3>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {lowStockItems.slice(0, 3).map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(' • ')}
                  {lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} more` : ''}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 self-start sm:self-auto shrink-0">
              Needs Reorder
            </span>
          </div>
        </div>
      )}

      {/* Top High-Density KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(todaySales.totalRevenue)}
          icon={<DollarSign size={20} />}
          color="green"
        />
        <StatCard
          title="Total Orders"
          value={todaySales.totalOrders}
          icon={<ShoppingBag size={20} />}
          color="blue"
        />
        <StatCard
          title="Active Orders"
          value={activeOrders.length}
          icon={<Clock size={20} />}
          color="yellow"
        />
        <StatCard
          title="Table Occupancy"
          value={`${occupiedTables}/${tables.length}`}
          icon={<Users size={20} />}
          color="purple"
        />
      </div>

      {/* Main Operational Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4">
        {/* Left Column: Live Operations (Orders + Table Status) */}
        <div className="lg:col-span-7 space-y-3.5 sm:space-y-4">
          {/* Recent Orders Card */}
          <Card padding="sm" className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Recent Orders
                </h3>
                <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-extrabold px-2 py-0.5">
                  {recentOrders.length} Live
                </span>
              </div>
              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
                Auto-updating
              </span>
            </div>

            <div className="space-y-2">
              {recentOrders.length === 0 ? (
                <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                  No orders recorded today yet.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-2.5 bg-gray-50/80 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800/60 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold',
                        order.type === 'dine-in'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                      )}>
                        {order.type === 'dine-in' ? (order.tableNumber ? `T${order.tableNumber}` : 'DIN') : 'TAK'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-xs text-gray-900 dark:text-white truncate">
                            {order.orderNumber}
                          </p>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            • {order.items.length} item{order.items.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {order.customerName || (order.tableNumber ? `Table ${order.tableNumber}` : 'Takeaway')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 pl-2">
                      <div className="text-right">
                        <p className="font-bold text-xs text-gray-900 dark:text-white">
                          {formatCurrency(order.total)}
                        </p>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <Badge
                            size="sm"
                            variant={
                              order.status === 'completed' ? 'success' :
                              order.status === 'preparing' ? 'warning' :
                              order.status === 'ready' ? 'info' : 'default'
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => printInvoice(order)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/80 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        title="Print Receipt"
                      >
                        <Printer size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Table Floor Status Card */}
          <Card padding="sm" className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Floor Plan & Tables
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {availableTables} Free
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  {occupiedTables} Occupied
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {tables.map((table) => {
                const isOccupied = table.status === 'occupied';
                const isAvailable = table.status === 'available';
                const isReserved = table.status === 'reserved';

                return (
                  <div
                    key={table.id}
                    className={cn(
                      'p-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all',
                      isOccupied && 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-300 font-bold',
                      isAvailable && 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900/50 dark:text-emerald-300',
                      isReserved && 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900/50 dark:text-amber-300',
                      !isOccupied && !isAvailable && !isReserved && 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700'
                    )}
                  >
                    <span className="text-sm font-extrabold leading-none">
                      T{table.number}
                    </span>
                    <span className="text-[10px] opacity-75 mt-0.5">
                      {table.capacity}p
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Analytics & Sales Performance */}
        <div className="lg:col-span-5 space-y-3.5 sm:space-y-4">
          {/* Weekly Revenue Trend Card */}
          <Card padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Weekly Revenue
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Last 7 days revenue trend
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold px-1.5 py-0.5">
                <TrendingUp size={12} />
                +12.5%
              </span>
            </div>

            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <BarChart data={weeklyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: '11px',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    }}
                    formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Payment Methods Breakdown Card */}
          <Card padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Payment Distribution
              </h3>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Today
              </span>
            </div>

            <div className="space-y-2">
              {paymentMethodData.length === 0 ? (
                <p className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                  No settled payments recorded today.
                </p>
              ) : (
                paymentMethodData.map((item) => {
                  const totalPayments = paymentMethodData.reduce((acc, p) => acc + p.value, 0);
                  const pct = totalPayments > 0 ? Math.round((item.value / totalPayments) * 100) : 0;

                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                        </div>
                        <span className="text-gray-900 dark:text-white">{formatCurrency(item.value)} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Top 5 Best Selling Items Card */}
          <Card padding="sm" className="space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Best Selling Dishes
              </h3>
              <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-1.5 py-0.5">
                Top 5
              </span>
            </div>

            <div className="space-y-2">
              {bestSelling.length === 0 ? (
                <p className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                  No sales data recorded yet.
                </p>
              ) : (
                bestSelling.map((item, index) => (
                  <div
                    key={item.itemId}
                    className="flex items-center justify-between p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        'w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold shrink-0',
                        index === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' :
                        index === 1 ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                        index === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300' :
                        'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      )}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                          {item.itemName}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {item.quantity} orders sold
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pl-2">
                      {formatCurrency(item.revenue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

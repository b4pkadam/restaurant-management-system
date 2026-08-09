import React, { useMemo } from 'react';
import {
  DollarSign, ShoppingBag, Users, TrendingUp,
  Clock
} from 'lucide-react';
import { Card, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';
import { orderDB, tableDB, analyticsDB, settingsDB } from '../database/db';
import { cn } from '../utils/cn';
import { useDbUpdate } from '../hooks/useDbUpdate';
import { formatCurrency } from '../utils/formatCurrency';

export const Dashboard: React.FC = () => {
  useDbUpdate();
  const settings = settingsDB.get();
  const today = new Date().toISOString().split('T')[0];
  
  const todaySales = useMemo(() => analyticsDB.getDailySales(today), [today]);
  const weeklySales = useMemo(() => analyticsDB.getWeeklySales(), []);
  const bestSelling = useMemo(() => analyticsDB.getBestSellingItems(5), []);
  const activeOrders = useMemo(() => orderDB.getActive(), []);
  const tables = useMemo(() => tableDB.getAll(), []);
  
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
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold">Welcome back!</h2>
        <p className="text-blue-100 mt-1">
          Here's what's happening at {settings.restaurantName} today.
        </p>
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-2">
            <Clock size={16} />
            <span className="text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(todaySales.totalRevenue)}
          icon={<DollarSign size={24} />}
          color="green"
        />
        <StatCard
          title="Total Orders"
          value={todaySales.totalOrders}
          icon={<ShoppingBag size={24} />}
          color="blue"
        />
        <StatCard
          title="Active Orders"
          value={activeOrders.length}
          icon={<Clock size={24} />}
          color="yellow"
        />
        <StatCard
          title="Table Occupancy"
          value={`${occupiedTables}/${tables.length}`}
          icon={<Users size={24} />}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Revenue Chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Weekly Revenue
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Last 7 days performance
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1 text-green-600">
                <TrendingUp size={16} />
                +12.5%
              </span>
              <span className="text-gray-500">vs last week</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: 'none', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment Methods */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Payment Methods
          </h3>
          <div className="h-48">
            {paymentMethodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [formatCurrency(Number(value))]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                No payments today
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4 mt-4">
            {paymentMethodData.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Orders
            </h3>
            <Badge variant="primary">{recentOrders.length} orders</Badge>
          </div>
          <div className="space-y-3">
            {recentOrders.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No orders yet
              </p>
            ) : (
              recentOrders.map(order => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      order.type === 'dine-in' 
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    )}>
                      {order.type === 'dine-in' ? <Users size={18} /> : <ShoppingBag size={18} />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {order.orderNumber}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {order.type === 'dine-in' ? `Table ${order.tableNumber}` : 'Takeaway'} • {order.items.length} items
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(order.total)}
                    </p>
                    <Badge
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
              ))
            )}
          </div>
        </Card>

        {/* Best Selling Items */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Best Selling Items
            </h3>
            <Badge variant="success">Top 5</Badge>
          </div>
          <div className="space-y-3">
            {bestSelling.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No sales data yet
              </p>
            ) : (
              bestSelling.map((item, index) => (
                <div
                  key={item.itemId}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                      index === 0 ? 'bg-yellow-100 text-yellow-700' :
                      index === 1 ? 'bg-gray-200 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    )}>
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.itemName}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {item.quantity} sold
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(item.revenue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Table Status */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Table Status
          </h3>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              Available ({availableTables})
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              Occupied ({occupiedTables})
            </span>
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
          {tables.map(table => (
            <div
              key={table.id}
              className={cn(
                'aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-colors',
                table.status === 'available' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                table.status === 'occupied' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                table.status === 'reserved' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                table.status === 'cleaning' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
              )}
            >
              <span className="text-lg font-bold">{table.number}</span>
              <span className="text-xs opacity-75">{table.capacity}p</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

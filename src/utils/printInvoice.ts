import { format } from 'date-fns';
import { settingsDB, paymentDB } from '../database/db';
import type { Order, Payment } from '../types';
import { formatCurrency } from './formatCurrency';

/**
 * Universal print invoice / receipt utility for all dashboards
 * (POS, Kitchen Display, Orders Management, Reports, etc.)
 */
export function printInvoice(order: Order, explicitPayment?: Payment | null) {
  const settings = settingsDB.get();
  const payment = explicitPayment || paymentDB.getByOrder(order.id);
  const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);

  const invoiceWindow = window.open('', '_blank', 'width=850,height=750');
  if (!invoiceWindow) return;

  const rows = order.items
    .map((item) => {
      const displaySpice = item.spiceLevel;
      const displayDrink = item.selectedDrink;
      const displayNotes = item.notes;

      const extras = [
        displaySpice ? `🌶️ Spice: ${displaySpice}` : '',
        displayDrink ? `🥤 Drink: ${displayDrink}` : '',
        displayNotes ? `📝 Note: ${displayNotes}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;">
            <div style="font-weight:600;font-size:14px;color:#111827;">${item.menuItemName}</div>
            ${extras ? `<div style="font-size:11px;color:#d97706;margin-top:3px;font-weight:500;">${extras}</div>` : ''}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:bold;font-size:14px;">${item.quantity}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:#4b5563;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;font-size:14px;color:#111827;">${formatCurrency(item.totalPrice)}</td>
        </tr>
      `;
    })
    .join('');

  invoiceWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - Order #${order.orderNumber}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #111827; background: #fff; margin: 0; }
          .container { max-width: 680px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; }
          .badge-paid { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; display: inline-block; }
          .badge-unpaid { background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; display: inline-block; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
          .meta-box { background: #f9fafb; padding: 12px 14px; border-radius: 10px; border: 1px solid #f3f4f6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f3f4f6; padding: 10px 8px; text-align: left; font-size: 12px; text-transform: uppercase; color: #4b5563; }
          .totals { margin-left: auto; max-width: 300px; }
          .tot-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: #4b5563; }
          .tot-final { display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #111827; font-size: 18px; font-weight: bold; color: #111827; margin-top: 4px; }
          .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${settings.restaurantName}</h1>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">${settings.restaurantAddress || ''}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Phone: ${settings.restaurantPhone || 'N/A'}${settings.gstNumber ? ` | GST: ${settings.gstNumber}` : ''}</p>
            </div>
            <div style="text-align:right;">
              <div style="margin-bottom:6px;">
                ${isPaid ? `<span class="badge-paid">✓ PAID (${(payment?.method || 'COMPLETED').toUpperCase()})</span>` : `<span class="badge-unpaid">⏳ PAYMENT PENDING</span>`}
              </div>
              <h2 style="margin:0;font-size:16px;color:#1e40af;font-weight:bold;">Order #${order.orderNumber}</h2>
              <p style="margin:3px 0 0;font-size:11px;color:#6b7280;">${format(new Date(order.createdAt), 'PPpp')}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-box">
              <span style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6b7280;">Customer Info</span>
              <p style="margin:4px 0 0;font-weight:600;font-size:13px;">${order.customerName || 'Walk-in Customer'}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${order.customerPhone || 'Phone: Not specified'}</p>
            </div>
            <div class="meta-box">
              <span style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6b7280;">Service Details</span>
              <p style="margin:4px 0 0;font-weight:600;font-size:13px;">${order.type === 'dine-in' ? `Table #${order.tableNumber || 'N/A'} (Dine-in)` : 'Takeaway Order'}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">Staff: ${order.waiterName || payment?.receivedBy || 'Staff'}</p>
            </div>
          </div>

          ${order.notes ? `
            <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:#92400e;">
              <strong>📝 Order Instructions:</strong> ${order.notes}
            </div>
          ` : ''}

          <table>
            <thead>
              <tr>
                <th style="width:50%;">Item & Special Options</th>
                <th style="text-align:center;width:15%;">Qty</th>
                <th style="text-align:right;width:15%;">Price</th>
                <th style="text-align:right;width:20%;">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div class="totals">
            <div class="tot-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(order.subtotal)}</span>
            </div>
            ${order.discount > 0 ? `
              <div class="tot-row" style="color:#16a34a;">
                <span>Discount:</span>
                <span>-${formatCurrency(order.discount)}</span>
              </div>
            ` : ''}
            <div class="tot-row">
              <span>Tax (${settings.taxPercentage}%):</span>
              <span>${formatCurrency(order.tax)}</span>
            </div>
            <div class="tot-final">
              <span>Total Amount:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
          </div>

          <div class="footer">
            <p style="margin:0;font-weight:600;">Thank you for dining with us!</p>
            <p style="margin:4px 0 0;">Please visit us again • Powered by ${settings.restaurantName}</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  invoiceWindow.document.close();
}

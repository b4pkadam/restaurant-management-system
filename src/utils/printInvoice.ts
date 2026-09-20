import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { settingsDB, paymentDB } from '../database/db';
import type { Order, Payment } from '../types';
import { formatCurrency } from './formatCurrency';
import { escapeHtml, sanitizeUrl } from './security';

function getTaxLabels(currency?: string) {
  const taxIdLabel =
    currency === 'INR'
      ? 'GST'
      : currency === 'USD'
      ? 'Tax ID'
      : currency === 'EUR' || currency === 'GBP'
      ? 'VAT'
      : currency === 'JPY'
      ? 'Invoice Reg. No.'
      : currency === 'NPR'
      ? 'PAN'
      : 'Tax ID';

  const taxRateLabel =
    currency === 'INR'
      ? 'GST'
      : currency === 'USD'
      ? 'Sales Tax'
      : currency === 'EUR' || currency === 'GBP'
      ? 'VAT'
      : currency === 'JPY'
      ? 'Consumption Tax'
      : 'Tax';

  return { taxIdLabel, taxRateLabel };
}

/**
 * Generates and downloads a true 80mm (small POS thermal roll) PDF file.
 */
export function downloadThermalReceiptPdf(order: Order, explicitPayment?: Payment | null) {
  const settings = settingsDB.get();
  const payment = explicitPayment || paymentDB.getByOrder(order.id);
  const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);
  const { taxIdLabel, taxRateLabel } = getTaxLabels(settings.currency);

  // Standard 80mm POS thermal paper width
  const pageWidth = 80;
  // Calculate height dynamically based on item count, modifiers, and notes
  let lineCount = 18;
  order.items.forEach((it) => {
    lineCount += 1;
    if (it.spiceLevel || it.selectedDrink || it.notes) lineCount += 1;
  });
  if (order.notes) lineCount += 2;
  const pageHeight = Math.max(125, lineCount * 4.5 + 24);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, pageHeight],
  });

  const sym = settings.currencySymbol || '$';
  const formatAmt = (val: number) => {
    const num = Number(val || 0).toFixed(2);
    if (settings.currency === 'INR') return `Rs.${num}`;
    if (settings.currency === 'JPY') return `¥${Math.round(val)}`;
    return `${sym}${num}`;
  };

  const left = 4;
  const right = 76;
  const center = 40;
  let y = 7;

  // Restaurant Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.text((settings.restaurantName || 'RESTAURANT').toUpperCase(), center, y, { align: 'center' });
  y += 4.5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  if (settings.restaurantAddress) {
    doc.text(settings.restaurantAddress, center, y, { align: 'center' });
    y += 3.5;
  }
  if (settings.restaurantPhone) {
    doc.text(`Tel: ${settings.restaurantPhone}`, center, y, { align: 'center' });
    y += 3.5;
  }
  if (settings.gstNumber) {
    doc.text(`${taxIdLabel}: ${settings.gstNumber}`, center, y, { align: 'center' });
    y += 3.5;
  }

  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 3.5;

  // Order Details
  doc.setFontSize(8);
  doc.text(`Order: #${order.orderNumber}`, left, y);
  const orderTypeStr = order.type === 'dine-in' ? `Table ${order.tableNumber || 'N/A'}` : 'Takeaway';
  doc.text(orderTypeStr, right, y, { align: 'right' });
  y += 3.5;

  doc.text(`Date: ${format(new Date(order.createdAt), 'dd/MM/yyyy HH:mm')}`, left, y);
  const staff = order.waiterName || payment?.receivedBy || 'Staff';
  doc.text(`Staff: ${staff}`, right, y, { align: 'right' });
  y += 3.5;

  if (order.customerName) {
    doc.text(`Cust: ${order.customerName}`, left, y);
    y += 3.5;
  }

  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 3.5;

  // Table Columns
  doc.setFont('courier', 'bold');
  doc.text('QTY', left, y);
  doc.text('ITEM', left + 10, y);
  doc.text('PRICE', 58, y, { align: 'right' });
  doc.text('TOTAL', right, y, { align: 'right' });
  y += 3;

  doc.setFont('courier', 'normal');
  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 3.5;

  // Items
  order.items.forEach((item) => {
    doc.setFont('courier', 'normal');
    doc.text(`${item.quantity}x`, left, y);
    const maxLen = 17;
    const name = item.menuItemName.length > maxLen ? item.menuItemName.substring(0, maxLen) + '..' : item.menuItemName;
    doc.text(name, left + 10, y);
    doc.text(formatAmt(item.unitPrice), 58, y, { align: 'right' });
    doc.text(formatAmt(item.totalPrice), right, y, { align: 'right' });
    y += 3.5;

    const extras = [
      item.spiceLevel ? `* ${item.spiceLevel}` : '',
      item.selectedDrink ? `* ${item.selectedDrink}` : '',
      item.notes ? `* ${item.notes}` : '',
    ].filter(Boolean).join(' ');

    if (extras) {
      doc.setFontSize(6.5);
      doc.text(extras.substring(0, 42), left + 10, y);
      doc.setFontSize(8);
      y += 3;
    }
  });

  doc.text('------------------------------------------', center, y, { align: 'center' });
  y += 3.5;

  // Totals
  doc.text('Subtotal:', left, y);
  doc.text(formatAmt(order.subtotal), right, y, { align: 'right' });
  y += 3.5;

  if (order.discount > 0) {
    doc.text('Discount:', left, y);
    doc.text(`-${formatAmt(order.discount)}`, right, y, { align: 'right' });
    y += 3.5;
  }

  doc.text(`${taxRateLabel} (${settings.taxPercentage}%):`, left, y);
  doc.text(formatAmt(order.tax), right, y, { align: 'right' });
  y += 3.5;

  doc.text('==========================================', center, y, { align: 'center' });
  y += 3.5;

  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.text('TOTAL AMOUNT:', left, y);
  doc.text(formatAmt(order.total), right, y, { align: 'right' });
  y += 4.5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  const payMethod = (payment?.method || (isPaid ? 'PAID' : 'PENDING')).toUpperCase();
  doc.text(`Payment: ${isPaid ? `PAID (${payMethod})` : 'PENDING'}`, left, y);
  y += 3.5;

  if (payment?.amountTendered && payment.amountTendered > order.total) {
    doc.text(`Tendered: ${formatAmt(payment.amountTendered)}`, left, y);
    doc.text(`Change: ${formatAmt(payment.changeDue || 0)}`, right, y, { align: 'right' });
    y += 3.5;
  }

  doc.text('==========================================', center, y, { align: 'center' });
  y += 3.5;

  if (order.notes) {
    doc.setFontSize(7);
    doc.text(`Note: ${order.notes}`, left, y);
    y += 3.5;
  }

  doc.setFontSize(7.5);
  doc.text('Thank you for dining with us!', center, y, { align: 'center' });
  y += 3.5;
  doc.text('Please visit us again', center, y, { align: 'center' });
  y += 3.5;

  doc.setFont('courier', 'bold');
  doc.text(`* ${order.orderNumber} *`, center, y, { align: 'center' });

  doc.save(`receipt-${order.orderNumber}.pdf`);
}

/**
 * Small 80mm POS thermal receipt format for restaurant POS thermal printers and PDF export.
 */
export function printInvoice(order: Order, explicitPayment?: Payment | null) {
  const settings = settingsDB.get();
  const payment = explicitPayment || paymentDB.getByOrder(order.id);
  const isPaid = Boolean(payment || order.paymentStatus === 'paid' || order.isPaid);
  const safeLogo = sanitizeUrl(settings.restaurantLogo);
  const { taxIdLabel, taxRateLabel } = getTaxLabels(settings.currency);

  const invoiceWindow = window.open('', '_blank', 'width=440,height=750');
  if (!invoiceWindow) return;

  const rowsHtml = order.items
    .map((item) => {
      const displaySpice = item.spiceLevel ? escapeHtml(item.spiceLevel) : '';
      const displayDrink = item.selectedDrink ? escapeHtml(item.selectedDrink) : '';
      const displayNotes = item.notes ? escapeHtml(item.notes) : '';

      const extras = [
        displaySpice ? `🌶️ ${displaySpice}` : '',
        displayDrink ? `🥤 ${displayDrink}` : '',
        displayNotes ? `📝 ${displayNotes}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      return `
        <tr>
          <td class="col-qty">${Number(item.quantity) || 1}x</td>
          <td class="col-item">
            <div class="item-name">${escapeHtml(item.menuItemName)}</div>
            ${extras ? `<div class="item-extra">${extras}</div>` : ''}
          </td>
          <td class="col-price">${formatCurrency(item.unitPrice)}</td>
          <td class="col-total">${formatCurrency(item.totalPrice)}</td>
        </tr>
      `;
    })
    .join('');

  invoiceWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt - Order #${escapeHtml(order.orderNumber)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 2mm 3mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            padding: 16px 8px;
            background: #f3f4f6;
            font-family: 'Courier New', Courier, 'Roboto Mono', 'SF Mono', monospace, -apple-system, sans-serif;
            color: #000;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .toolbar {
            width: 80mm;
            max-width: 320px;
            background: #111827;
            color: #fff;
            padding: 8px 10px;
            border-radius: 8px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
          }
          .btn {
            background: #2563eb;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            text-decoration: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            transition: background 0.15s ease;
          }
          .btn:hover {
            background: #1d4ed8;
          }
          .btn-secondary {
            background: #374151;
          }
          .btn-secondary:hover {
            background: #4b5563;
          }
          .receipt-paper {
            width: 80mm;
            max-width: 320px;
            background: #ffffff;
            padding: 12px 10px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            font-size: 11.5px;
            line-height: 1.35;
          }
          @media print {
            body {
              background: #ffffff !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print {
              display: none !important;
            }
            .receipt-paper {
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .left { text-align: left; }
          .bold { font-weight: bold; }
          .dashed {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }
          .double {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            height: 3px;
            margin: 6px 0;
          }
          .store-name {
            font-size: 15px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 2px 0;
          }
          .store-meta {
            font-size: 10.5px;
            color: #222;
            margin: 1px 0;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 1.5px 0;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 4px 0;
            font-size: 11px;
          }
          .items-table th {
            border-bottom: 1px dashed #000;
            padding: 3px 0;
            font-size: 10.5px;
            font-weight: bold;
          }
          .items-table td {
            padding: 3px 0 1px 0;
            vertical-align: top;
          }
          .col-qty {
            text-align: left;
            width: 12%;
            font-weight: bold;
          }
          .col-item {
            text-align: left;
            width: 48%;
          }
          .col-price {
            text-align: right;
            width: 20%;
          }
          .col-total {
            text-align: right;
            width: 20%;
            font-weight: bold;
          }
          .item-name {
            font-weight: bold;
          }
          .item-extra {
            font-size: 9.5px;
            color: #444;
            font-style: italic;
            padding-left: 4px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 1.5px 0;
            font-size: 11px;
          }
          .grand-total {
            font-size: 13.5px;
            font-weight: 900;
            padding: 3px 0;
          }
          .barcode {
            font-family: monospace;
            letter-spacing: 2px;
            font-weight: bold;
            font-size: 12px;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <!-- Top Toolbar for Screen Preview -->
        <div class="toolbar no-print">
          <button class="btn" onclick="window.print()">
            🖨️ Print Receipt
          </button>
          <button class="btn btn-secondary" onclick="window.print()" title="Choose 'Save as PDF' in the destination dropdown to get a small 80mm thermal PDF">
            📄 Save as PDF
          </button>
          <button class="btn btn-secondary" onclick="window.close()">
            ✕ Close
          </button>
        </div>

        <!-- 80mm Small Thermal Paper Receipt -->
        <div class="receipt-paper">
          <div class="center">
            ${safeLogo ? `<img src="${safeLogo}" alt="Logo" style="max-height:36px;max-width:130px;margin-bottom:4px;object-fit:contain;" /><br/>` : ''}
            <div class="store-name">${escapeHtml(settings.restaurantName)}</div>
            ${settings.restaurantAddress ? `<div class="store-meta">${escapeHtml(settings.restaurantAddress)}</div>` : ''}
            ${settings.restaurantPhone ? `<div class="store-meta">Tel: ${escapeHtml(settings.restaurantPhone)}</div>` : ''}
            ${settings.gstNumber ? `<div class="store-meta">${taxIdLabel}: ${escapeHtml(settings.gstNumber)}</div>` : ''}
          </div>

          <div class="dashed"></div>

          <div class="meta-row">
            <span><b>Order:</b> #${escapeHtml(order.orderNumber)}</span>
            <span><b>${order.type === 'dine-in' ? `Table ${escapeHtml(order.tableNumber || 'N/A')}` : 'Takeaway'}</b></span>
          </div>
          <div class="meta-row">
            <span>Date: ${format(new Date(order.createdAt), 'dd/MM/yyyy HH:mm')}</span>
            <span>Staff: ${escapeHtml(order.waiterName || payment?.receivedBy || 'Staff')}</span>
          </div>
          ${order.customerName ? `
            <div class="meta-row">
              <span>Cust: ${escapeHtml(order.customerName)}</span>
              ${order.customerPhone ? `<span>${escapeHtml(order.customerPhone)}</span>` : ''}
            </div>
          ` : ''}

          <div class="dashed"></div>

          <table class="items-table">
            <thead>
              <tr>
                <th class="left" style="width:12%;">QTY</th>
                <th class="left" style="width:48%;">ITEM</th>
                <th class="right" style="width:20%;">PRICE</th>
                <th class="right" style="width:20%;">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="dashed"></div>

          <div class="totals-row">
            <span>Subtotal:</span>
            <span>${formatCurrency(order.subtotal)}</span>
          </div>
          ${order.discount > 0 ? `
            <div class="totals-row">
              <span>Discount:</span>
              <span>-${formatCurrency(order.discount)}</span>
            </div>
          ` : ''}
          <div class="totals-row">
            <span>${taxRateLabel} (${settings.taxPercentage}%):</span>
            <span>${formatCurrency(order.tax)}</span>
          </div>

          <div class="double"></div>

          <div class="totals-row grand-total">
            <span>TOTAL AMOUNT:</span>
            <span>${formatCurrency(order.total)}</span>
          </div>

          <div class="double"></div>

          <div class="totals-row">
            <span>Payment:</span>
            <span class="bold">${isPaid ? `PAID (${escapeHtml((payment?.method || 'COMPLETED').toUpperCase())})` : 'PENDING'}</span>
          </div>
          ${payment?.amountTendered && payment.amountTendered > order.total ? `
            <div class="totals-row">
              <span>Amount Tendered:</span>
              <span>${formatCurrency(payment.amountTendered)}</span>
            </div>
            <div class="totals-row">
              <span>Change Due:</span>
              <span>${formatCurrency(payment.changeDue || 0)}</span>
            </div>
          ` : ''}

          ${order.notes ? `
            <div class="dashed"></div>
            <div style="font-size:10px;padding:2px 0;">
              <b>Notes:</b> ${escapeHtml(order.notes)}
            </div>
          ` : ''}

          <div class="dashed"></div>

          <div class="center" style="font-size:10.5px;margin-top:6px;">
            <div>Thank you for dining with us!</div>
            <div>Please visit us again</div>
            <div class="barcode">* ${escapeHtml(order.orderNumber)} *</div>
            <div style="font-size:9px;color:#555;margin-top:4px;">Printed at ${format(new Date(), 'HH:mm:ss')}</div>
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

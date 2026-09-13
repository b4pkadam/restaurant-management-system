import { Download, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { settingsDB } from '../database/db';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: number;
}

export function QRCodeModal({ isOpen, onClose, tableNumber }: QRCodeModalProps) {
  const settings = settingsDB.get();

  // Build the URL that a customer will scan
  // Use query parameter ?table=N — works reliably across all mobile QR scanners,
  // browser redirects, and hosting platforms (hash fragments can get stripped)
  const basePath = window.location.pathname.replace(/\/+$/, '');
  const orderUrl = `${window.location.origin}${basePath}?table=${tableNumber}`;

  const printQR = () => {
    const svgElement = document.getElementById('qr-code-svg');
    const svgString = svgElement ? new XMLSerializer().serializeToString(svgElement) : '';

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) return;

    const escapedName = (settings.restaurantName || 'Restaurant')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const escapedLogo = settings.restaurantLogo ? settings.restaurantLogo.replace(/"/g, '&quot;') : '';

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Table ${tableNumber} QR Code</title>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              text-align: center;
              padding: 32px 16px;
              margin: 0;
              background: #ffffff;
              color: #111827;
            }
            .card {
              max-width: 380px;
              margin: 0 auto;
              border: 2px solid #1f2937;
              border-radius: 24px;
              padding: 36px 24px;
            }
            .logo {
              width: 60px;
              height: 60px;
              object-fit: cover;
              border-radius: 12px;
              margin-bottom: 12px;
            }
            .title {
              margin: 0 0 6px;
              font-size: 22px;
              font-weight: 800;
            }
            .subtitle {
              margin: 0 0 20px;
              color: #4b5563;
              font-size: 14px;
            }
            .qr-wrapper {
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0 auto 20px;
              padding: 12px;
              background: #ffffff;
              border-radius: 16px;
            }
            .qr-wrapper svg {
              width: 220px;
              height: 220px;
              display: block;
            }
            .table-badge {
              background: #f3f4f6;
              border-radius: 14px;
              padding: 12px;
              margin-bottom: 14px;
            }
            .table-num {
              margin: 0;
              font-size: 40px;
              font-weight: 900;
              letter-spacing: -0.02em;
            }
            .instructions {
              margin: 0;
              font-size: 12px;
              color: #6b7280;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <div class="card">
            ${escapedLogo ? `<img src="${escapedLogo}" alt="Logo" class="logo" />` : ''}
            <h1 class="title">${escapedName}</h1>
            <p class="subtitle">Scan to order from your phone</p>
            <div class="qr-wrapper">
              ${svgString}
            </div>
            <div class="table-badge">
              <p class="table-num">Table ${tableNumber}</p>
            </div>
            <p class="instructions">Point your smartphone camera at this QR code to view our digital menu and order instantly.</p>
          </div>
          <script>
            window.addEventListener('load', () => {
              window.focus();
              setTimeout(() => window.print(), 200);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 0, 0, 400, 400);
      }
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `table-${tableNumber}-qr-code.png`;
      downloadLink.href = pngUrl;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`QR Code — Table ${tableNumber}`} size="md">
      <div className="space-y-6 text-center">
        {/* QR Code */}
        <div className="mx-auto inline-flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-800/50">
          <QRCodeSVG
            id="qr-code-svg"
            value={orderUrl}
            size={200}
            bgColor="#ffffff"
            fgColor="#111827"
            level="H"
            includeMargin
          />
          <div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">Table {tableNumber}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{settings.restaurantName}</p>
          </div>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Customers scan this QR code to open the digital menu and place orders directly from their phone.
        </p>

        {/* URL preview */}
        <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-900/20">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Order URL</p>
          <p className="mt-1 break-all text-xs text-blue-600 dark:text-blue-400">{orderUrl}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={printQR} leftIcon={<Printer size={16} />}>
            Print QR Card
          </Button>
          <Button className="flex-1" onClick={downloadQR} leftIcon={<Download size={16} />}>
            Download PNG
          </Button>
        </div>
      </div>
    </Modal>
  );
}

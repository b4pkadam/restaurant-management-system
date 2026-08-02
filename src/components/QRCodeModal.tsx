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
    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head><title>Table ${tableNumber} QR Code</title></head>
        <body style="font-family:Arial,sans-serif;text-align:center;padding:40px;">
          <div style="max-width:400px;margin:0 auto;border:3px solid #111;border-radius:24px;padding:40px 32px;">
            <h1 style="margin:0 0 8px;font-size:24px;">${settings.restaurantName}</h1>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">Scan to order from your phone</p>
            <div style="display:flex;justify-content:center;margin-bottom:24px;" id="qr-container"></div>
            <div style="background:#f3f4f6;border-radius:16px;padding:16px;margin-bottom:16px;">
              <p style="margin:0;font-size:48px;font-weight:900;color:#111827;">Table ${tableNumber}</p>
            </div>
            <p style="margin:0;font-size:13px;color:#9ca3af;">Point your phone camera at the QR code to open our digital menu and place your order directly.</p>
          </div>
          <script>
            // Render QR as an image for printing
            const canvas = document.createElement('canvas');
            const size = 220;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // Simple fallback: show the URL text and a styled placeholder
            const container = document.getElementById('qr-container');
            const img = new Image();
            img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent('${orderUrl}');
            img.width = 220;
            img.height = 220;
            img.style.borderRadius = '12px';
            container.appendChild(img);
            
            img.onload = () => window.print();
            img.onerror = () => {
              container.innerHTML = '<p style="padding:20px;background:#f3f4f6;border-radius:12px;word-break:break-all;font-size:12px;">${orderUrl}</p>';
              window.print();
            };
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

import { useState } from 'react';
import { Download, Printer, Copy, Check, ExternalLink } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { settingsDB } from '../database/db';
import { escapeHtml, sanitizeUrl } from '../utils/security';
import { cn } from '../utils/cn';

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
    const svgString = svgElement && svgElement.tagName.toLowerCase() === 'svg'
      ? new XMLSerializer().serializeToString(svgElement)
      : '';

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) return;

    const escapedName = escapeHtml(settings.restaurantName || 'Restaurant');
    const safeLogo = sanitizeUrl(settings.restaurantLogo);
    const safeTableNum = Number(tableNumber) || 0;

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Table ${safeTableNum} QR Code</title>
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
            ${safeLogo ? `<img src="${safeLogo}" alt="Logo" class="logo" />` : ''}
            <h1 class="title">${escapedName}</h1>
            <p class="subtitle">Scan to order from your phone</p>
            <div class="qr-wrapper">
              ${svgString}
            </div>
            <div class="table-badge">
              <p class="table-num">Table ${safeTableNum}</p>
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

  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = orderUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`QR Code — Table ${tableNumber}`} size="md">
      <div className="space-y-4 text-center">
        {/* QR Code */}
        <div className="mx-auto inline-flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
          <QRCodeSVG
            id="qr-code-svg"
            value={orderUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#111827"
            level="H"
            includeMargin
          />
          <div>
            <p className="text-xl font-black text-gray-900 dark:text-white">Table {tableNumber}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{settings.restaurantName}</p>
          </div>
        </div>

        {/* URL Preview with 1-Click Copy */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 p-2.5 border border-blue-200 dark:border-blue-900/60 text-left">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-blue-800 dark:text-blue-300">Live Customer Order URL</p>
            <p className="truncate text-xs font-mono text-blue-600 dark:text-blue-400">{orderUrl}</p>
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className={cn(
              "flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-all shadow-2xs cursor-pointer",
              copied
                ? "bg-emerald-600 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
            title="Copy URL"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="outline" size="sm" onClick={printQR} leftIcon={<Printer size={15} />}>
            Print QR Card
          </Button>
          <Button variant="primary" size="sm" onClick={downloadQR} leftIcon={<Download size={15} />}>
            Download PNG
          </Button>
        </div>
      </div>
    </Modal>
  );
}

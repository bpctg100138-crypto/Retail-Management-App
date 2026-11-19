import React, { useEffect, useRef, useState } from 'react';
import { Camera, Lock, Printer, X } from 'lucide-react';
import {
  AppSettings,
  buildThermalReceiptText,
  ProtectedActionKey,
  Sale,
} from '../lib/posEngine';

interface AdminAuthModalProps {
  action: ProtectedActionKey;
  reference: string;
  onVerify: (password: string) => boolean;
  onClose: () => void;
}

const ACTION_TITLES: Record<ProtectedActionKey, string> = {
  REMOVE_CART_ITEM: 'Remove Scanned Product from Cart',
  REDUCE_CART_QTY: 'Reduce Scanned Item Quantity',
  CLEAR_CART: 'Cancel / Clear Entire POS Bill',
  APPLY_DISCOUNT: 'Apply Discount to Bill',
  CANCEL_BILL: 'Cancel Completed Bill',
  OVERRIDE_STOCK: 'Sell Above Available Stock',
  PRODUCT_SENSITIVE: 'Edit or Delete Product',
  VENDOR_SENSITIVE: 'Edit or Delete Vendor',
  CATEGORY_SENSITIVE: 'Delete Category or Subcategory',
  STOCK_ADJUSTMENT: 'Manual Stock Adjustment',
  PROCESS_EXCHANGE: 'Authorize 3-Day Product Exchange',
  RESTORE_BACKUP: 'Restore Database Backup',
  SENSITIVE_REPORTS: 'Access Profit & Margin Reports',
};

export function AdminAuthModal({ action, reference, onVerify, onClose }: AdminAuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Enter administrator password.');
      return;
    }
    const ok = onVerify(password);
    if (!ok) {
      setError('Incorrect administrator password.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-auth-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 id="admin-auth-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Administrator Authorization
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ACTION_TITLES[action]} {reference ? `· ${reference}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authorization dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-auth-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Administrator Password
            </label>
            <input
              ref={inputRef}
              id="admin-auth-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter password"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            {error && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              Authorize
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ThermalReceiptModalProps {
  sale: Sale;
  settings: AppSettings;
  onClose: () => void;
}

export function ThermalReceiptModal({ sale, settings, onClose }: ThermalReceiptModalProps) {
  const receiptText = buildThermalReceiptText(sale, settings);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="receipt-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Thermal Receipt · {sale.billNumber}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {settings.paperWidthMm}mm ESC/POS Paper Preview
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt preview"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-4 flex justify-center">
          <pre
            id="thermal-receipt-print"
            className={`font-mono-num whitespace-pre-wrap text-xs leading-relaxed text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 p-4 border border-dashed border-slate-300 dark:border-slate-700 ${
              settings.paperWidthMm === 80 ? 'w-[360px]' : 'w-[280px]'
            }`}
          >
            {receiptText}
          </pre>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface CameraScannerModalProps {
  quickBarcodes: { name: string; barcode: string }[];
  onDetected: (code: string, source: 'CAMERA' | 'USB_HID' | 'BT_HID') => void;
  onClose: () => void;
}

export function CameraScannerModal({ quickBarcodes, onDetected, onClose }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera API unavailable in this browser context. Use quick barcode triggers below or USB/BT HID input.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (active && videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError('Camera permission denied or no camera attached. Use quick barcode triggers below to simulate scan.');
      }
    }
    start();
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-teal-700 dark:text-teal-400" />
            <h2 id="scanner-modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Unified Barcode Scanner
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close barcode scanner"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 aspect-video flex items-center justify-center">
            {cameraError ? (
              <p className="px-6 text-center text-xs text-slate-300">{cameraError}</p>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Simulate Hardware Scan (Camera ML Kit / USB OTG HID / Bluetooth HID)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto">
              {quickBarcodes.map((item) => (
                <button
                  key={item.barcode}
                  type="button"
                  onClick={() => {
                    onDetected(item.barcode, 'CAMERA');
                    onClose();
                  }}
                  className="text-left rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors"
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{item.name}</div>
                  <div className="font-mono-num text-slate-500 dark:text-slate-400">{item.barcode}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

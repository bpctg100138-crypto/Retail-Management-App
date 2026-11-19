import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Minus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import {
  CartItem,
  computeCartTotals,
  formatMoney,
  Product,
  ProtectedActionKey,
  RetailDatabase,
} from '../lib/posEngine';
import { t } from '../lib/i18n';
import { CameraScannerModal } from './Modals';

interface PosViewProps {
  db: RetailDatabase;
  cart: CartItem[];
  discount: number;
  customerName: string;
  customerMobile: string;
  onCustomerChange: (name: string, mobile: string) => void;
  onAddProduct: (product: Product, allowOverStock?: boolean) => void;
  onSetCartQty: (productId: string, newQty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onApplyDiscount: (amount: number) => void;
  onCompleteSale: (allowOverStock?: boolean) => void;
  onRequireAuth: (action: ProtectedActionKey, ref: string, cb: () => void) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function PosView({
  db,
  cart,
  discount,
  customerName,
  customerMobile,
  onCustomerChange,
  onAddProduct,
  onSetCartQty,
  onRemoveItem,
  onClearCart,
  onApplyDiscount,
  onCompleteSale,
  onRequireAuth,
  onNotify,
}: PosViewProps) {
  const [scanInput, setScanInput] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(discount));
  const scanRef = useRef<HTMLInputElement>(null);
  const lang = db.settings.language;
  const currency = db.settings.currencySymbol;

  useEffect(() => {
    setDiscountInput(String(discount));
  }, [discount]);

  const productMap = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const totals = useMemo(() => computeCartTotals(cart, productMap, discount), [cart, productMap, discount]);

  const processBarcode = (rawCode: string, sourceLabel: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const match = db.products.find(
      (p) => p.barcode.toLowerCase() === code.toLowerCase() || p.productCode.toLowerCase() === code.toLowerCase()
    );
    if (!match) {
      onNotify(`Product not found for barcode "${code}" (${sourceLabel})`, true);
      return;
    }
    if (match.currentStock <= 0) {
      onRequireAuth('OVERRIDE_STOCK', `${match.name} (0 stock)`, () => {
        onAddProduct(match, true);
      });
      return;
    }
    const existing = cart.find((c) => c.productId === match.id);
    if (existing && existing.quantity + 1 > match.currentStock) {
      onRequireAuth('OVERRIDE_STOCK', `${match.name} (Stock: ${match.currentStock})`, () => {
        onAddProduct(match, true);
      });
      return;
    }
    onAddProduct(match, false);
  };

  // Global USB OTG / Bluetooth HID rapid-keystroke wedge buffer when not typing inside another field
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (isInput && target !== scanRef.current) return;

      const now = Date.now();
      if (now - lastTime > 120) {
        buffer = '';
      }
      lastTime = now;

      if (e.key === 'Enter' && buffer.length >= 4 && document.activeElement !== scanRef.current) {
        e.preventDefault();
        const code = buffer;
        buffer = '';
        processBarcode(code, 'HID Scanner');
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const filteredProducts = useMemo(() => {
    const q = scanInput.trim().toLowerCase();
    if (!q) return db.products;
    return db.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q)
    );
  }, [db.products, scanInput]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    processBarcode(scanInput, 'Scanner / Manual');
    setScanInput('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Unified Scanner + Product Quick Pick */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <form onSubmit={handleScanSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <ScanBarcode className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={scanRef}
                type="text"
                aria-label="Scan barcode or search product"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder={t(lang, 'scanPlaceholder')}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 whitespace-nowrap shrink-0"
            >
              {t(lang, 'scanAdd')}
            </button>
            <button
              type="button"
              onClick={() => setShowCameraModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Camera className="h-4 w-4" />
              {t(lang, 'cameraScan')}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Supports Camera (EAN-13, EAN-8, UPC, Code 128/39, QR), USB OTG HID keyboard wedge, and Bluetooth HID scanners.
          </p>
        </div>

        {/* Product Quick-Pick Grid */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t(lang, 'quickPick')} ({filteredProducts.length})
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t(lang, 'tapToAdd')}</span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching products found. Register products in the Products tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredProducts.map((p) => {
                const out = p.currentStock <= 0;
                const low = !out && p.currentStock <= p.minStockAlert;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (out) {
                        onRequireAuth('OVERRIDE_STOCK', `${p.name} (Out of stock)`, () => onAddProduct(p, true));
                      } else {
                        const existing = cart.find((c) => c.productId === p.id);
                        if (existing && existing.quantity + 1 > p.currentStock) {
                          onRequireAuth('OVERRIDE_STOCK', p.name, () => onAddProduct(p, true));
                        } else {
                          onAddProduct(p, false);
                        }
                      }
                    }}
                    className="text-left rounded-lg border border-slate-200 dark:border-slate-800 p-3 hover:border-teal-600 dark:hover:border-teal-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                        {p.name}
                      </span>
                      <span className="font-mono-num text-sm font-bold text-teal-700 dark:text-teal-400 whitespace-nowrap">
                        {formatMoney(p.sellingPrice, currency)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono-num">{p.barcode}</span>
                      <span
                        className={`font-mono-num font-medium ${
                          out
                            ? 'text-red-600 dark:text-red-400'
                            : low
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        Stock: {p.currentStock} {p.unit}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Active Bill / Cart */}
      <div className="lg:col-span-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col h-full">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t(lang, 'currentBill')} ({cart.length})
            </h3>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={onClearCart}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-40"
            >
              {t(lang, 'clearCart')}
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 min-h-[220px] max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 my-2">
            {cart.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
                {t(lang, 'emptyCart')}
              </p>
            ) : (
              cart.map((item) => {
                const p = productMap.get(item.productId);
                if (!p) return null;
                const lineSub = (item.unitPrice * item.quantity).toFixed(2);
                return (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                        {formatMoney(item.unitPrice, currency)} · Stock {p.currentStock} {p.unit}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${p.name}`}
                        onClick={() => onSetCartQty(p.id, item.quantity - 1)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        aria-label={`Quantity for ${p.name}`}
                        value={item.quantity}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (Number.isFinite(val)) onSetCartQty(p.id, val);
                        }}
                        className="w-12 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-1 text-center font-mono-num text-xs text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${p.name}`}
                        onClick={() => {
                          if (item.quantity + 1 > p.currentStock) {
                            onRequireAuth('OVERRIDE_STOCK', p.name, () => onSetCartQty(p.id, item.quantity + 1));
                          } else {
                            onSetCartQty(p.id, item.quantity + 1);
                          }
                        }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-20 text-right font-mono-num text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {currency}{lineSub}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name} from bill`}
                        onClick={() => onRemoveItem(p.id)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Customer Info & Totals */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="pos-cust-name" className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Customer Name (Optional)
                </label>
                <input
                  id="pos-cust-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => onCustomerChange(e.target.value, customerMobile)}
                  placeholder="Walk-in"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="pos-cust-mobile" className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Mobile (Optional)
                </label>
                <input
                  id="pos-cust-mobile"
                  type="tel"
                  value={customerMobile}
                  onChange={(e) => onCustomerChange(customerName, e.target.value)}
                  placeholder="017XX-XXXXXX"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-discount" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Discount ({currency})
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="pos-discount"
                  type="number"
                  min={0}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-right font-mono-num text-xs text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => onApplyDiscount(Math.max(0, Number(discountInput) || 0))}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="space-y-1 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t(lang, 'totalQuantity')}</span>
                <span className="font-mono-num">{totals.totalQuantity}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t(lang, 'subtotal')}</span>
                <span className="font-mono-num">{formatMoney(totals.subtotal, currency)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>{t(lang, 'discountLabel')}</span>
                  <span className="font-mono-num">-{formatMoney(totals.discount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-1">
                <span>{t(lang, 'grandTotal')}</span>
                <span className="font-mono-num text-teal-700 dark:text-teal-400">
                  {formatMoney(totals.grandTotal, currency)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => onCompleteSale(false)}
              className="w-full rounded-xl bg-teal-700 px-4 py-3.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-40 transition-colors"
            >
              {t(lang, 'completeSale')} · {formatMoney(totals.grandTotal, currency)}
            </button>
          </div>
        </div>
      </div>

      {showCameraModal && (
        <CameraScannerModal
          quickBarcodes={db.products.slice(0, 8).map((p) => ({ name: p.name, barcode: p.barcode }))}
          onDetected={(code, src) => processBarcode(code, src)}
          onClose={() => setShowCameraModal(false)}
        />
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer, RefreshCw, Upload } from 'lucide-react';
import androidManifest from '../data/androidProjectManifest.json';
import {
  buildCsv,
  computeSalesMetrics,
  createSalt,
  executeExchangeTransaction,
  formatDhakaDateTime,
  formatMoney,
  getDhakaDateKey,
  hashPassword,
  isEligibleForExchange,
  ProtectedActionKey,
  RetailDatabase,
  round2,
  Sale,
  verifyPassword,
} from '../lib/posEngine';

function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsView({ db }: { db: RetailDatabase }) {
  const [period, setPeriod] = useState<'DAILY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'>('DAILY');
  const [fromDate, setFromDate] = useState(() => getDhakaDateKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
  const [toDate, setToDate] = useState(() => getDhakaDateKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
  const [customerMobileQuery, setCustomerMobileQuery] = useState('');
  const currency = db.settings.currencySymbol;

  const { fromMillis, toMillis } = useMemo(() => {
    const now = Date.now();
    const todayStr = getDhakaDateKey(now);
    const y = Number(todayStr.slice(0, 4));
    const m = Number(todayStr.slice(4, 6)) - 1;
    const d = Number(todayStr.slice(6, 8));
    // Asia/Dhaka is UTC+6:00
    const dhakaOffsetMs = 6 * 3600 * 1000;
    if (period === 'DAILY') {
      const start = Date.UTC(y, m, d) - dhakaOffsetMs;
      return { fromMillis: start, toMillis: start + 86400000 - 1 };
    }
    if (period === 'MONTHLY') {
      const start = Date.UTC(y, m, 1) - dhakaOffsetMs;
      return { fromMillis: start, toMillis: now + 86400000 };
    }
    if (period === 'YEARLY') {
      const start = Date.UTC(y, 0, 1) - dhakaOffsetMs;
      return { fromMillis: start, toMillis: now + 86400000 };
    }
    const f = Date.parse(`${fromDate}T00:00:00+06:00`) || 0;
    const t = Date.parse(`${toDate}T23:59:59+06:00`) || now;
    return { fromMillis: f, toMillis: t };
  }, [period, fromDate, toDate]);

  const summary = useMemo(() => computeSalesMetrics(db.sales, fromMillis, toMillis), [db.sales, fromMillis, toMillis]);
  const filteredSales = useMemo(
    () => db.sales.filter((s) => s.status !== 'CANCELLED' && s.createdAt >= fromMillis && s.createdAt <= toMillis),
    [db.sales, fromMillis, toMillis]
  );

  const productMap = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);

  const categoryRows = useMemo(() => {
    return db.categories.map((cat) => {
      let qty = 0;
      let amount = 0;
      for (const s of filteredSales) {
        for (const item of s.items) {
          if (productMap.get(item.productId)?.categoryId === cat.id) {
            qty += item.quantity;
            amount += item.subtotal;
          }
        }
      }
      const share = summary.totalSales > 0 ? round2((amount / summary.totalSales) * 100) : 0;
      return { name: cat.name, qty, amount: round2(amount), share };
    });
  }, [db.categories, filteredSales, productMap, summary.totalSales]);

  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; amount: number; profit: number }>();
    for (const s of filteredSales) {
      for (const item of s.items) {
        const prev = map.get(item.productId) ?? { name: item.productName, qty: 0, amount: 0, profit: 0 };
        prev.qty += item.quantity;
        prev.amount = round2(prev.amount + item.subtotal);
        prev.profit = round2(prev.profit + (item.unitPrice - item.purchasePriceAtSale) * item.quantity);
        map.set(item.productId, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredSales]);

  const filteredCustomers = useMemo(() => {
    const q = customerMobileQuery.trim();
    return db.customers.filter((c) => !q || c.mobile.includes(q) || c.name.toLowerCase().includes(q.toLowerCase()));
  }, [db.customers, customerMobileQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports & Analytics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Computed strictly from completed database transactions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const csv = buildCsv(
                ['BillNumber', 'Date', 'Customer', 'Mobile', 'Qty', 'Subtotal', 'Discount', 'GrandTotal', 'Status'],
                filteredSales.map((s) => [
                  s.billNumber,
                  formatDhakaDateTime(s.createdAt),
                  s.customerName,
                  s.customerMobile,
                  s.totalQuantity,
                  s.subtotal,
                  s.discountAmount,
                  s.grandTotal,
                  s.status,
                ])
              );
              downloadTextFile(`bazarpos_sales_${period.toLowerCase()}.csv`, csv);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Sales CSV
          </button>
          <button
            type="button"
            onClick={() => {
              const csv = buildCsv(
                ['Code', 'Name', 'Barcode', 'Purchase', 'Selling', 'GP', 'GP%', 'Stock', 'Unit'],
                db.products.map((p) => [
                  p.productCode,
                  p.name,
                  p.barcode,
                  p.purchasePrice,
                  p.sellingPrice,
                  p.gpAmount,
                  p.gpPercentage,
                  p.currentStock,
                  p.unit,
                ])
              );
              downloadTextFile('bazarpos_inventory.csv', csv);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Inventory CSV
          </button>
        </div>
      </div>

      {/* Period Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {(['DAILY', 'MONTHLY', 'YEARLY', 'CUSTOM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                period === p ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {p === 'DAILY' ? 'Today' : p === 'MONTHLY' ? 'This Month' : p === 'YEARLY' ? 'This Year' : 'Custom Range'}
            </button>
          ))}
        </div>
        {period === 'CUSTOM' && (
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5" />
            <span>to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5" />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatBox label="Total Sales" value={formatMoney(summary.totalSales, currency)} />
        <StatBox label="Gross Profit" value={formatMoney(summary.totalProfit, currency)} />
        <StatBox label="Bills" value={String(summary.totalBills)} />
        <StatBox label="Items Sold" value={String(summary.totalItemsSold)} />
        <StatBox label="Avg Bill Value" value={formatMoney(summary.avgBillValue, currency)} />
        <StatBox label="Avg Basket Size" value={summary.avgBasketSize.toFixed(2)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Report */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold mb-3">Category Contribution</h3>
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr><th className="py-2 text-left">Category</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Share</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {categoryRows.map((r) => (
                <tr key={r.name}>
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2 text-right font-mono-num">{r.qty}</td>
                  <td className="py-2 text-right font-mono-num">{formatMoney(r.amount, currency)}</td>
                  <td className="py-2 text-right font-mono-num">{r.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Product Report */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold mb-3">Product-Wise Sales & Profit</h3>
          {productRows.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No sales recorded in the selected period.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr><th className="py-2 text-left">Product</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Sales</th><th className="py-2 text-right">Profit</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productRows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="py-2 text-right font-mono-num">{r.qty}</td>
                    <td className="py-2 text-right font-mono-num">{formatMoney(r.amount, currency)}</td>
                    <td className="py-2 text-right font-mono-num text-teal-700 dark:text-teal-400">{formatMoney(r.profit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Customer Search Report */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Customer Purchase History</h3>
          <input
            type="text"
            value={customerMobileQuery}
            onChange={(e) => setCustomerMobileQuery(e.target.value)}
            placeholder="Search by mobile or name..."
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs"
          />
        </div>
        {filteredCustomers.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No customer records yet. Add customer mobile during POS checkout.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr><th className="py-2 text-left">Customer</th><th className="py-2 text-left">Mobile</th><th className="py-2 text-right">Bills</th><th className="py-2 text-right">Total Spent</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2 font-mono-num">{c.mobile}</td>
                  <td className="py-2 text-right font-mono-num">{c.billCount}</td>
                  <td className="py-2 text-right font-mono-num font-semibold">{formatMoney(c.totalSpent, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold font-mono-num">{value}</div>
    </div>
  );
}

interface BillHistoryProps {
  db: RetailDatabase;
  onUpdateDb: (updater: (prev: RetailDatabase) => RetailDatabase) => void;
  onViewReceipt: (sale: Sale) => void;
  onRequireAuth: (action: ProtectedActionKey, ref: string, cb: () => void) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function BillHistoryView({ db, onUpdateDb, onViewReceipt, onRequireAuth, onNotify }: BillHistoryProps) {
  const [query, setQuery] = useState('');
  const [exchangeSale, setExchangeSale] = useState<Sale | null>(null);
  const [returnProductId, setReturnProductId] = useState('');
  const [replacementProductId, setReplacementProductId] = useState('');
  const [exchangeReason, setExchangeReason] = useState('Customer requested product exchange within 3 days');
  const currency = db.settings.currencySymbol;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.sales.filter(
      (s) =>
        !q ||
        s.billNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.customerMobile.includes(q)
    );
  }, [db.sales, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Bill History & 3-Day Exchanges</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Completed bills are immutable · Exchanges allowed within 3 days with administrator authorization (no cash refunds).
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bill #, customer, mobile..."
          className="w-full sm:w-72 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Bill #</th>
              <th className="px-4 py-3 font-semibold">Date & Time</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold text-right">Items / Qty</th>
              <th className="px-4 py-3 font-semibold text-right">Grand Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No bills recorded yet. Complete a sale in POS.</td></tr>
            ) : (
              filtered.map((s) => {
                const eligible = isEligibleForExchange(s.createdAt) && s.status !== 'CANCELLED';
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono-num font-semibold">{s.billNumber}</td>
                    <td className="px-4 py-3 font-mono-num text-slate-500">{formatDhakaDateTime(s.createdAt)}</td>
                    <td className="px-4 py-3">{s.customerName || 'Walk-in'} {s.customerMobile ? `· ${s.customerMobile}` : ''}</td>
                    <td className="px-4 py-3 text-right font-mono-num">{s.items.length} / {s.totalQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold">{formatMoney(s.grandTotal, currency)}</td>
                    <td className="px-4 py-3 font-mono-num">{s.status}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      <button type="button" onClick={() => onViewReceipt(s)} className="text-teal-700 dark:text-teal-400 font-medium hover:underline">
                        Reprint
                      </button>
                      {eligible && (
                        <button
                          type="button"
                          onClick={() => {
                            setExchangeSale(s);
                            setReturnProductId(s.items[0]?.productId ?? '');
                            setReplacementProductId(db.products.find((p) => p.currentStock > 0)?.id ?? '');
                          }}
                          className="text-slate-700 dark:text-slate-200 font-medium hover:underline"
                        >
                          Exchange
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {db.exchanges.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-semibold mb-3">Exchange History ({db.exchanges.length})</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {db.exchanges.map((ex) => (
              <div key={ex.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono-num font-semibold">{ex.exchangeNumber}</span> · Linked Bill{' '}
                  <span className="font-mono-num">{ex.originalBillNumber}</span> · {ex.reason}
                </div>
                <div className="font-mono-num">
                  Returned {formatMoney(ex.returnedTotal, currency)} → Replacement {formatMoney(ex.replacementTotal, currency)} (Payable {formatMoney(ex.netDifference, currency)})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {exchangeSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold">3-Day Exchange · {exchangeSale.billNumber}</h3>
            <p className="text-slate-500">No cash refund is available. Replacement value must equal or exceed returned item value.</p>
            <div>
              <label className="block font-medium mb-1">Returned Item (Qty 1)</label>
              <select value={returnProductId} onChange={(e) => setReturnProductId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
                {exchangeSale.items.map((item) => (
                  <option key={item.productId} value={item.productId}>{item.productName} ({formatMoney(item.unitPrice, currency)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Replacement Item (Qty 1)</label>
              <select value={replacementProductId} onChange={(e) => setReplacementProductId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
                {db.products.filter((p) => p.currentStock > 0).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({formatMoney(p.sellingPrice, currency)} · Stock {p.currentStock})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Reason</label>
              <input value={exchangeReason} onChange={(e) => setExchangeReason(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setExchangeSale(null)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const targetSale = exchangeSale;
                  onRequireAuth('PROCESS_EXCHANGE', targetSale.billNumber, () => {
                    const res = executeExchangeTransaction(db, {
                      originalSaleId: targetSale.id,
                      returnedItems: [{ productId: returnProductId, quantity: 1 }],
                      replacementItems: [{ productId: replacementProductId, quantity: 1 }],
                      reason: exchangeReason,
                    });
                    if (!res.ok) {
                      onNotify(res.error, true);
                      return;
                    }
                    onUpdateDb(() => res.db);
                    setExchangeSale(null);
                    onNotify(`Exchange ${res.exchange.exchangeNumber} processed.`);
                  });
                }}
                className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white"
              >
                Authorize Exchange
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  db,
  onUpdateDb,
  onRequireAuth,
  onNotify,
}: {
  db: RetailDatabase;
  onUpdateDb: (updater: (prev: RetailDatabase) => RetailDatabase) => void;
  onRequireAuth: (action: ProtectedActionKey, ref: string, cb: () => void) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const s = db.settings;
  const [storeName, setStoreName] = useState(s.storeName);
  const [storeAddress, setStoreAddress] = useState(s.storeAddress);
  const [storePhone, setStorePhone] = useState(s.storePhone);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings, Security & Offline Backup</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure store details, paper size, printer preferences, password rules, and local backup/restore.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store & Receipt Config */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold">Store Profile & Receipt Settings</h3>
          <div><label className="block font-medium mb-1">Store Name</label><input value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
          <div><label className="block font-medium mb-1">Store Address</label><input value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
          <div><label className="block font-medium mb-1">Store Phone</label><input value={storePhone} onChange={(e) => setStorePhone(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => onUpdateDb((p) => ({ ...p, settings: { ...p.settings, paperWidthMm: 58 } }))} className={`rounded-lg border px-3 py-1.5 ${s.paperWidthMm === 58 ? 'border-teal-700 bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold' : 'border-slate-300 dark:border-slate-700'}`}>58mm Thermal</button>
            <button type="button" onClick={() => onUpdateDb((p) => ({ ...p, settings: { ...p.settings, paperWidthMm: 80 } }))} className={`rounded-lg border px-3 py-1.5 ${s.paperWidthMm === 80 ? 'border-teal-700 bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold' : 'border-slate-300 dark:border-slate-700'}`}>80mm Thermal</button>
          </div>

          <button
            type="button"
            onClick={() => {
              onUpdateDb((p) => ({ ...p, settings: { ...p.settings, storeName, storeAddress, storePhone } }));
              onNotify('Store profile saved.');
            }}
            className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
          >
            Save Store Profile
          </button>
        </div>

        {/* Security & Password */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold">Password & Protection Rules</h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['protectPosRemoval', 'POS Item Removal / Qty Reduce'],
                ['protectPosDiscount', 'POS Discounts'],
                ['protectProductOps', 'Product Edit / Delete'],
                ['protectVendorOps', 'Vendor Edit / Delete'],
                ['protectCategoryOps', 'Category Delete'],
                ['protectStockAdjust', 'Stock Adjustments'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s[key]}
                  onChange={(e) => onUpdateDb((p) => ({ ...p, settings: { ...p.settings, [key]: e.target.checked } }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="font-medium">Change Administrator Password</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="password" value={oldPass} onChange={(e) => setOldPass(e.target.value)} placeholder="Current password" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New password (4+)" className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!verifyPassword(oldPass, s.adminPasswordHash, s.adminPasswordSalt)) {
                  onNotify('Current password is incorrect.', true);
                  return;
                }
                if (newPass.length < 4) {
                  onNotify('New password must be at least 4 characters.', true);
                  return;
                }
                const salt = createSalt();
                const hash = hashPassword(newPass, salt);
                onUpdateDb((p) => ({
                  ...p,
                  settings: { ...p.settings, adminPasswordHash: hash, adminPasswordSalt: salt },
                  auditLogs: [{ id: `aud-${Date.now()}`, actionType: 'PASSWORD_CHANGED', targetReference: 'SETTINGS', details: 'Administrator password updated', createdAt: Date.now() }, ...p.auditLogs],
                }));
                setOldPass('');
                setNewPass('');
                onNotify('Administrator password updated.');
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 font-medium"
            >
              Update Password
            </button>
          </div>
        </div>
      </div>

      {/* Offline Backup & Restore + Bluetooth Printer Guidance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold">Offline Backup & Restore</h3>
          <p className="text-slate-500">Export your entire local database (products, vendors, sales, movements, audit logs) as JSON or restore from a saved backup.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadTextFile(`bazarpos_backup_${getDhakaDateKey()}.json`, JSON.stringify(db, null, 2), 'application/json')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 font-semibold text-white hover:bg-teal-800"
            >
              <Download className="h-4 w-4" />
              Export Backup JSON
            </button>
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="h-4 w-4" />
              Restore from JSON
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((txt) => setPendingRestoreJson(txt));
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {pendingRestoreJson && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
              <div className="font-semibold text-amber-800 dark:text-amber-300">Confirm Overwrite Existing Data?</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onRequireAuth('RESTORE_BACKUP', 'JSON_RESTORE', () => {
                      try {
                        const parsed = JSON.parse(pendingRestoreJson) as RetailDatabase;
                        if (!Array.isArray(parsed.products) || !parsed.settings) throw new Error('Invalid backup structure');
                        onUpdateDb(() => parsed);
                        setPendingRestoreJson(null);
                        onNotify('Backup restored successfully.');
                      } catch {
                        onNotify('Invalid backup JSON file.', true);
                        setPendingRestoreJson(null);
                      }
                    });
                  }}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-white font-semibold"
                >
                  Confirm & Restore
                </button>
                <button type="button" onClick={() => setPendingRestoreJson(null)} className="rounded-lg border border-slate-300 px-3 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">ESC/POS Thermal Printer & Audit Log</h3>
            <Printer className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-slate-500">
            Web preview prints via browser Print/PDF. The Android APK connects directly over Bluetooth Classic SPP (`00001101-...`) with bitmap raster fallback (`GS v 0`) for Bangla text on 58mm & 80mm thermal printers.
          </p>
          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 pt-2">
            {db.auditLogs.length === 0 ? (
              <p className="text-slate-500 py-4 text-center">No audit entries yet.</p>
            ) : (
              db.auditLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="py-1.5 flex justify-between gap-2">
                  <span className="font-mono-num font-medium">{log.actionType}</span>
                  <span className="text-slate-500 truncate">{log.details}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManifestFile {
  path: string;
  size: number;
  lines: number;
  content: string;
}

export function AndroidProjectView() {
  const files = androidManifest as ManifestFile[];
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '');
  const selected = files.find((f) => f.path === selectedPath) ?? files[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Android Studio Project (Kotlin · Jetpack Compose · Room)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {files.length} source, Gradle, manifest, resource, and test files ready for Android Studio &{' '}
            <code className="font-mono-num rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-800 dark:text-slate-200">
              ./gradlew assembleDebug
            </code>
          </p>
        </div>
        <a
          href="/bazar-pos-android.zip"
          download="bazar-pos-android.zip"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          Download Android Studio ZIP
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 max-h-[540px] overflow-y-auto">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2 pb-2">
            Project Files ({files.length})
          </div>
          <div className="space-y-0.5">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs font-mono-num truncate transition-colors ${
                  selectedPath === f.path
                    ? 'bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {f.path.replace('android-pos/', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 p-4 max-h-[540px] overflow-auto">
          {selected && (
            <>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs font-mono-num text-slate-400">
                <span>{selected.path}</span>
                <span>{selected.lines} lines · {(selected.size / 1024).toFixed(1)} KB</span>
              </div>
              <pre className="text-xs font-mono-num leading-relaxed whitespace-pre">
                {selected.content}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

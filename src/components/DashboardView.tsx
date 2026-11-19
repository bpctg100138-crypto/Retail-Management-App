import React, { useMemo } from 'react';
import {
  formatMoney,
  getDhakaDateKey,
  RetailDatabase,
  round2,
} from '../lib/posEngine';
import { t } from '../lib/i18n';

export type NavRoute =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'vendors'
  | 'categories'
  | 'stock'
  | 'reports'
  | 'bills'
  | 'settings'
  | 'android';

interface DashboardViewProps {
  db: RetailDatabase;
  onNavigate: (route: NavRoute) => void;
}

export function DashboardView({ db, onNavigate }: DashboardViewProps) {
  const lang = db.settings.language;
  const currency = db.settings.currencySymbol;
  const todayKey = getDhakaDateKey();

  const metrics = useMemo(() => {
    const todaySales = db.sales.filter((s) => s.billDateKey === todayKey && s.status !== 'CANCELLED');
    const totalSales = round2(todaySales.reduce((acc, s) => acc + s.grandTotal, 0));
    const totalBills = todaySales.length;
    const totalItems = todaySales.reduce((acc, s) => acc + s.totalQuantity, 0);
    const avgBillValue = totalBills > 0 ? round2(totalSales / totalBills) : 0;
    const avgBasketSize = totalBills > 0 ? round2(totalItems / totalBills) : 0;

    const totalStockQty = round2(db.products.reduce((acc, p) => acc + p.currentStock, 0));
    const lowStock = db.products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStockAlert);
    const outOfStock = db.products.filter((p) => p.currentStock <= 0);

    // 7-day sales breakdown strictly from real database sales
    const days: { key: string; label: string; total: number }[] = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const ts = now - i * 86400000;
      const key = getDhakaDateKey(ts);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka',
        day: '2-digit',
        month: 'short',
      }).format(new Date(ts));
      const dayTotal = round2(
        db.sales
          .filter((s) => s.billDateKey === key && s.status !== 'CANCELLED')
          .reduce((acc, s) => acc + s.grandTotal, 0)
      );
      days.push({ key, label, total: dayTotal });
    }

    return {
      totalSales,
      totalBills,
      avgBillValue,
      avgBasketSize,
      totalStockQty,
      lowStock,
      outOfStock,
      days,
    };
  }, [db.products, db.sales, todayKey]);

  const maxDayTotal = Math.max(1, ...metrics.days.map((d) => d.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t(lang, 'dashboard')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Asia/Dhaka · Date Key {todayKey} · Currency {currency} BDT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            Open POS Terminal
          </button>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {t(lang, 'products')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            {t(lang, 'reports')}
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={t(lang, 'todaysSales')} value={formatMoney(metrics.totalSales, currency)} />
        <KpiCard label={t(lang, 'totalBills')} value={String(metrics.totalBills)} />
        <KpiCard label={t(lang, 'avgBillValue')} value={formatMoney(metrics.avgBillValue, currency)} />
        <KpiCard label={t(lang, 'avgBasketSize')} value={metrics.avgBasketSize.toFixed(2)} />
      </div>

      {/* Secondary Inventory & Customer KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <KpiCard label={t(lang, 'totalCustomers')} value={String(db.customers.length)} />
        <KpiCard label={t(lang, 'totalProducts')} value={String(db.products.length)} />
        <KpiCard label={t(lang, 'totalStockQty')} value={String(metrics.totalStockQty)} />
        <KpiCard
          label={t(lang, 'lowStock')}
          value={String(metrics.lowStock.length)}
          tone={metrics.lowStock.length > 0 ? 'warn' : 'normal'}
        />
        <KpiCard
          label={t(lang, 'outOfStock')}
          value={String(metrics.outOfStock.length)}
          tone={metrics.outOfStock.length > 0 ? 'danger' : 'normal'}
        />
      </div>

      {/* Chart + Stock Alerts Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              7-Day Sales Summary (Actual Completed Bills)
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">Daily BDT</span>
          </div>
          <div className="grid grid-cols-7 gap-3 items-end h-44 pt-4">
            {metrics.days.map((d) => {
              const heightPct = d.total > 0 ? Math.max(8, Math.round((d.total / maxDayTotal) * 100)) : 4;
              return (
                <div key={d.key} className="flex flex-col items-center h-full justify-end gap-1.5">
                  <span className="font-mono-num text-[11px] text-slate-600 dark:text-slate-400">
                    {d.total > 0 ? `${Math.round(d.total)}` : '0'}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all ${
                        d.total > 0 ? 'bg-teal-700 dark:bg-teal-500' : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Stock Alerts
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              View Stock
            </button>
          </div>
          {metrics.lowStock.length === 0 && metrics.outOfStock.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              All products are above minimum stock levels.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...metrics.outOfStock, ...metrics.lowStock].slice(0, 6).map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.name}</div>
                    <div className="font-mono-num text-slate-500 dark:text-slate-400">{p.productCode}</div>
                  </div>
                  <span
                    className={`font-mono-num font-semibold whitespace-nowrap ${
                      p.currentStock <= 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {p.currentStock <= 0 ? `Out (0 ${p.unit})` : `Low (${p.currentStock} ${p.unit})`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick Access Module Cards */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {(
            [
              ['pos', t(lang, 'pos')],
              ['products', t(lang, 'products')],
              ['vendors', t(lang, 'vendors')],
              ['categories', t(lang, 'categories')],
              ['stock', t(lang, 'stock')],
              ['reports', t(lang, 'reports')],
              ['bills', t(lang, 'bills')],
              ['android', 'Android ZIP'],
            ] as [NavRoute, string][]
          ).map(([route, label]) => (
            <button
              key={route}
              type="button"
              onClick={() => onNavigate(route)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-center whitespace-nowrap truncate"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warn' | 'danger';
}) {
  const valueClass =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1.5 text-xl font-bold font-mono-num ${valueClass}`}>{value}</div>
    </div>
  );
}

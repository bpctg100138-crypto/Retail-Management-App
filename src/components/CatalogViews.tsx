import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import {
  calculateGp,
  Category,
  formatDhakaDateTime,
  formatMoney,
  nextSequentialCode,
  Product,
  ProtectedActionKey,
  RetailDatabase,
  round2,
  Subcategory,
  Vendor,
} from '../lib/posEngine';

interface CatalogProps {
  db: RetailDatabase;
  onUpdateDb: (updater: (prev: RetailDatabase) => RetailDatabase) => void;
  onRequireAuth: (action: ProtectedActionKey, ref: string, cb: () => void) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ProductsView({ db, onUpdateDb, onRequireAuth, onNotify }: CatalogProps) {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustNote, setAdjustNote] = useState('Manual stock count adjustment');

  // Form states
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [unit, setUnit] = useState('piece');

  const vendorMap = useMemo(() => new Map(db.vendors.map((v) => [v.id, v])), [db.vendors]);
  const catMap = useMemo(() => new Map(db.categories.map((c) => [c.id, c])), [db.categories]);
  const currency = db.settings.currencySymbol;

  const openCreate = () => {
    setEditing(null);
    setName('');
    setBarcode('');
    setDescription('');
    setVendorId(db.vendors[0]?.id ?? '');
    setCategoryId(db.categories[0]?.id ?? '');
    setSubcategoryId('');
    setPurchasePrice('');
    setSellingPrice('');
    setCurrentStock('0');
    setMinStockAlert('5');
    setUnit('piece');
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setBarcode(p.barcode);
    setDescription(p.description);
    setVendorId(p.vendorId);
    setCategoryId(p.categoryId);
    setSubcategoryId(p.subcategoryId ?? '');
    setPurchasePrice(String(p.purchasePrice));
    setSellingPrice(String(p.sellingPrice));
    setCurrentStock(String(p.currentStock));
    setMinStockAlert(String(p.minStockAlert));
    setUnit(p.unit);
    setShowModal(true);
  };

  const liveGp = calculateGp(Number(purchasePrice) || 0, Number(sellingPrice) || 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.products.filter((p) => {
      const vName = vendorMap.get(p.vendorId)?.name.toLowerCase() ?? '';
      const matchesQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        vName.includes(q);
      const matchesVendor = vendorFilter === 'ALL' || p.vendorId === vendorFilter;
      const matchesCat = categoryFilter === 'ALL' || p.categoryId === categoryFilter;
      const matchesStock =
        stockFilter === 'ALL' ||
        (stockFilter === 'LOW' && p.currentStock > 0 && p.currentStock <= p.minStockAlert) ||
        (stockFilter === 'OUT' && p.currentStock <= 0);
      return matchesQ && matchesVendor && matchesCat && matchesStock;
    });
  }, [db.products, search, vendorFilter, categoryFilter, stockFilter, vendorMap]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBarcode = barcode.trim();
    if (!name.trim() || !cleanBarcode || !vendorId || !categoryId) {
      onNotify('Name, barcode, vendor, and category are required.', true);
      return;
    }
    const duplicate = db.products.find(
      (p) => p.barcode.toLowerCase() === cleanBarcode.toLowerCase() && p.id !== editing?.id
    );
    if (duplicate) {
      onNotify(`Duplicate barcode "${cleanBarcode}" already assigned to ${duplicate.name}.`, true);
      return;
    }

    const pPrice = Math.max(0, Number(purchasePrice) || 0);
    const sPrice = Math.max(0, Number(sellingPrice) || 0);
    const gp = calculateGp(pPrice, sPrice);
    const now = Date.now();

    const commit = () => {
      onUpdateDb((prev) => {
        if (editing) {
          const nextProducts = prev.products.map((item) =>
            item.id === editing.id
              ? {
                  ...item,
                  vendorId,
                  categoryId,
                  subcategoryId: subcategoryId || null,
                  barcode: cleanBarcode,
                  name: name.trim(),
                  description: description.trim(),
                  purchasePrice: pPrice,
                  sellingPrice: sPrice,
                  gpAmount: gp.gpAmount,
                  gpPercentage: gp.gpPercentage,
                  minStockAlert: Number(minStockAlert) || 5,
                  unit: unit.trim() || 'piece',
                }
              : item
          );
          return { ...prev, products: nextProducts };
        }
        const productCode = nextSequentialCode('PRD', prev.products.map((x) => x.productCode));
        const initStock = Math.max(0, Number(currentStock) || 0);
        const newProd: Product = {
          id: `prd-${now}`,
          productCode,
          vendorId,
          categoryId,
          subcategoryId: subcategoryId || null,
          barcode: cleanBarcode,
          name: name.trim(),
          description: description.trim(),
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          gpAmount: gp.gpAmount,
          gpPercentage: gp.gpPercentage,
          currentStock: initStock,
          minStockAlert: Number(minStockAlert) || 5,
          unit: unit.trim() || 'piece',
          createdAt: now,
        };
        const nextMovements =
          initStock > 0
            ? [
                {
                  id: `mov-${now}`,
                  productId: newProd.id,
                  productName: newProd.name,
                  barcode: newProd.barcode,
                  movementType: 'INITIAL' as const,
                  quantity: initStock,
                  previousStock: 0,
                  newStock: initStock,
                  referenceBillId: '',
                  authorizedByAdmin: false,
                  note: 'Initial stock on product registration',
                  createdAt: now,
                },
                ...prev.stockMovements,
              ]
            : prev.stockMovements;
        return { ...prev, products: [newProd, ...prev.products], stockMovements: nextMovements };
      });
      setShowModal(false);
      onNotify(editing ? 'Product updated.' : 'Product registered.');
    };

    if (editing) {
      onRequireAuth('PRODUCT_SENSITIVE', editing.productCode, commit);
    } else {
      commit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Products ({filtered.length})</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Unique barcode validation · Live GP Amount & GP% margin calculation
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
        <input
          type="text"
          aria-label="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, ID, barcode, vendor..."
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        />
        <select
          aria-label="Filter by vendor"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="ALL">All Vendors</option>
          {db.vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          aria-label="Filter by category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        >
          <option value="ALL">All Categories</option>
          {db.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          {(['ALL', 'LOW', 'OUT'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStockFilter(s)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                stockFilter === s
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {s === 'ALL' ? 'All' : s === 'LOW' ? 'Low' : 'Out'}
            </button>
          ))}
        </div>
      </div>

      {/* Product Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Barcode</th>
              <th className="px-4 py-3 font-semibold">Category / Vendor</th>
              <th className="px-4 py-3 font-semibold text-right">Purchase</th>
              <th className="px-4 py-3 font-semibold text-right">Selling MRP</th>
              <th className="px-4 py-3 font-semibold text-right">GP (৳ / %)</th>
              <th className="px-4 py-3 font-semibold text-right">Stock</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                  No products match the current filter.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                    <div className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400">{p.productCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono-num text-slate-700 dark:text-slate-300">{p.barcode}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    <div>{catMap.get(p.categoryId)?.name ?? '—'}</div>
                    <div className="text-[11px]">{vendorMap.get(p.vendorId)?.name ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono-num">{formatMoney(p.purchasePrice, currency)}</td>
                  <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatMoney(p.sellingPrice, currency)}</td>
                  <td className="px-4 py-3 text-right font-mono-num text-teal-700 dark:text-teal-400">
                    {formatMoney(p.gpAmount, currency)} ({p.gpPercentage.toFixed(2)}%)
                  </td>
                  <td className="px-4 py-3 text-right font-mono-num">
                    <span
                      className={
                        p.currentStock <= 0
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : p.currentStock <= p.minStockAlert
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-slate-900 dark:text-slate-100'
                      }
                    >
                      {p.currentStock} {p.unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustTarget(p);
                        setAdjustDelta('0');
                        setAdjustNote('Manual stock adjustment');
                      }}
                      className="mr-2 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      Adjust
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => openEdit(p)}
                      className="mr-2 text-slate-600 dark:text-slate-300 hover:text-slate-900"
                    >
                      <Edit2 className="h-3.5 w-3.5 inline" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => {
                        onRequireAuth('PRODUCT_SENSITIVE', p.productCode, () => {
                          onUpdateDb((prev) => ({
                            ...prev,
                            products: prev.products.filter((x) => x.id !== p.id),
                          }));
                          onNotify('Product deleted.');
                        });
                      }}
                      className="text-red-600 dark:text-red-400 hover:opacity-80"
                    >
                      <Trash2 className="h-3.5 w-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">
              {editing ? `Edit Product (${editing.productCode})` : 'Register New Product'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prd-name" className="block font-medium mb-1">Product Name*</label>
                  <input id="prd-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
                </div>
                <div>
                  <label htmlFor="prd-barcode" className="block font-medium mb-1">Barcode*</label>
                  <input id="prd-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prd-vendor" className="block font-medium mb-1">Vendor*</label>
                  <select id="prd-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2">
                    <option value="">Select Vendor</option>
                    {db.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="prd-cat" className="block font-medium mb-1">Category*</label>
                  <select id="prd-cat" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2">
                    <option value="">Select Category</option>
                    {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="prd-sub" className="block font-medium mb-1">Subcategory</label>
                  <select id="prd-sub" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2">
                    <option value="">None</option>
                    {db.subcategories.filter((s) => s.categoryId === categoryId).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prd-buy" className="block font-medium mb-1">Purchase Price ({currency})</label>
                  <input id="prd-buy" type="number" step="0.01" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num" />
                </div>
                <div>
                  <label htmlFor="prd-sell" className="block font-medium mb-1">Selling Price / MRP ({currency})</label>
                  <input id="prd-sell" type="number" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num" />
                </div>
              </div>
              <div className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/30 px-3 py-2 flex items-center justify-between font-mono-num">
                <span>Live GP Amount: <strong>{formatMoney(liveGp.gpAmount, currency)}</strong></span>
                <span>Live GP %: <strong>{liveGp.gpPercentage.toFixed(2)}%</strong></span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prd-stock" className="block font-medium mb-1">Initial Stock</label>
                  <input id="prd-stock" type="number" disabled={Boolean(editing)} value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="prd-alert" className="block font-medium mb-1">Min Alert</label>
                  <input id="prd-alert" type="number" value={minStockAlert} onChange={(e) => setMinStockAlert(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num" />
                </div>
                <div>
                  <label htmlFor="prd-unit" className="block font-medium mb-1">Unit</label>
                  <input id="prd-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="piece, kg, litre" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
                </div>
              </div>
              <div>
                <label htmlFor="prd-desc" className="block font-medium mb-1">Description</label>
                <input id="prd-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 font-medium">Cancel</button>
                <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="text-base font-bold mb-1">Adjust Stock · {adjustTarget.name}</h3>
            <p className="text-xs text-slate-500 mb-4">Current Stock: {adjustTarget.currentStock} {adjustTarget.unit}</p>
            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="adj-delta" className="block font-medium mb-1">Quantity Change (+add / -deduct)</label>
                <input id="adj-delta" type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 font-mono-num" />
              </div>
              <div>
                <label htmlFor="adj-note" className="block font-medium mb-1">Reason / Note</label>
                <input id="adj-note" value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdjustTarget(null)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2">Cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    const delta = Number(adjustDelta) || 0;
                    if (delta === 0) return;
                    const target = adjustTarget;
                    setAdjustTarget(null);
                    onRequireAuth('STOCK_ADJUSTMENT', target.productCode, () => {
                      const now = Date.now();
                      onUpdateDb((prev) => {
                        const prod = prev.products.find((x) => x.id === target.id);
                        if (!prod) return prev;
                        const prevStock = prod.currentStock;
                        const nextStock = Math.max(0, round2(prevStock + delta));
                        return {
                          ...prev,
                          products: prev.products.map((x) => x.id === target.id ? { ...x, currentStock: nextStock } : x),
                          stockMovements: [
                            {
                              id: `mov-${now}`,
                              productId: prod.id,
                              productName: prod.name,
                              barcode: prod.barcode,
                              movementType: delta > 0 ? 'PURCHASE' : 'ADJUSTMENT',
                              quantity: delta,
                              previousStock: prevStock,
                              newStock: nextStock,
                              referenceBillId: '',
                              authorizedByAdmin: true,
                              note: adjustNote,
                              createdAt: now,
                            },
                            ...prev.stockMovements,
                          ],
                        };
                      });
                      onNotify('Stock adjusted.');
                    });
                  }}
                  className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white"
                >
                  Authorize & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VendorsView({ db, onUpdateDb, onRequireAuth, onNotify }: CatalogProps) {
  const [search, setSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.vendors.filter(
      (v) => !q || v.name.toLowerCase().includes(q) || v.vendorCode.toLowerCase().includes(q) || v.mobile.includes(q)
    );
  }, [db.vendors, search]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setContactPerson('');
    setMobile('');
    setAltPhone('');
    setAddress('');
    setNotes('');
    setShowForm(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setName(v.name);
    setContactPerson(v.contactPerson);
    setMobile(v.mobile);
    setAltPhone(v.altPhone);
    setAddress(v.address);
    setNotes(v.notes);
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobile.trim()) {
      onNotify('Vendor name and mobile are required.', true);
      return;
    }
    const commit = () => {
      onUpdateDb((prev) => {
        if (editing) {
          return {
            ...prev,
            vendors: prev.vendors.map((v) =>
              v.id === editing.id
                ? { ...v, name: name.trim(), contactPerson: contactPerson.trim(), mobile: mobile.trim(), altPhone: altPhone.trim(), address: address.trim(), notes: notes.trim() }
                : v
            ),
          };
        }
        const code = nextSequentialCode('VND', prev.vendors.map((v) => v.vendorCode));
        const newV: Vendor = {
          id: `vnd-${Date.now()}`,
          vendorCode: code,
          name: name.trim(),
          contactPerson: contactPerson.trim(),
          mobile: mobile.trim(),
          altPhone: altPhone.trim(),
          address: address.trim(),
          notes: notes.trim(),
          createdAt: Date.now(),
        };
        return { ...prev, vendors: [newV, ...prev.vendors] };
      });
      setShowForm(false);
      onNotify(editing ? 'Vendor updated.' : 'Vendor added.');
    };
    if (editing) {
      onRequireAuth('VENDOR_SENSITIVE', editing.vendorCode, commit);
    } else {
      commit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Vendors ({filtered.length})</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Auto-generated Vendor IDs & supplier product tracking</p>
        </div>
        <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          <Plus className="h-4 w-4" />
          Add Vendor
        </button>
      </div>

      <input
        type="text"
        aria-label="Search vendors"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search vendor name, ID, or mobile..."
        className="w-full max-w-md rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((v) => {
          const linked = db.products.filter((p) => p.vendorId === v.id);
          return (
            <div key={v.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{v.name}</div>
                  <div className="font-mono-num text-xs text-slate-500">{v.vendorCode} · {v.contactPerson}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label={`Edit ${v.name}`} onClick={() => openEdit(v)} className="text-slate-600 dark:text-slate-300">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${v.name}`}
                    onClick={() => {
                      if (linked.length > 0) {
                        onNotify(`Cannot delete ${v.name}: ${linked.length} product(s) assigned.`, true);
                        return;
                      }
                      onRequireAuth('VENDOR_SENSITIVE', v.vendorCode, () => {
                        onUpdateDb((prev) => ({ ...prev, vendors: prev.vendors.filter((x) => x.id !== v.id) }));
                        onNotify('Vendor deleted.');
                      });
                    }}
                    className="text-red-600 dark:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Mobile: {v.mobile} {v.altPhone ? `· Alt: ${v.altPhone}` : ''}
              </div>
              {v.address && <div className="text-xs text-slate-500">{v.address}</div>}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span>Linked Products: <strong>{linked.length}</strong></span>
                <button type="button" onClick={() => setSelectedVendorId(selectedVendorId === v.id ? null : v.id)} className="text-teal-700 dark:text-teal-400 font-medium hover:underline">
                  {selectedVendorId === v.id ? 'Hide Products' : 'View Products'}
                </button>
              </div>
              {selectedVendorId === v.id && (
                <ul className="pt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {linked.length === 0 ? <li>No products linked.</li> : linked.map((p) => <li key={p.id}>· {p.name} ({p.currentStock} {p.unit})</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="text-base font-bold mb-4">{editing ? `Edit Vendor (${editing.vendorCode})` : 'New Vendor'}</h3>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div><label className="block font-medium mb-1">Vendor Name*</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
              <div><label className="block font-medium mb-1">Contact Person</label><input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block font-medium mb-1">Mobile*</label><input value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
                <div><label className="block font-medium mb-1">Alt Phone</label><input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
              </div>
              <div><label className="block font-medium mb-1">Address</label><input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
              <div><label className="block font-medium mb-1">Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2">Cancel</button>
                <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function CategoriesView({ db, onUpdateDb, onRequireAuth, onNotify }: CatalogProps) {
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [subNames, setSubNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    onUpdateDb((prev) => {
      const code = nextSequentialCode('CAT', prev.categories.map((c) => c.categoryCode), 3);
      const next: Category = {
        id: `cat-${Date.now()}`,
        categoryCode: code,
        name: catName.trim(),
        description: catDesc.trim(),
        createdAt: Date.now(),
      };
      return { ...prev, categories: [...prev.categories, next] };
    });
    setCatName('');
    setCatDesc('');
    onNotify('Category created.');
  };

  const filtered = db.categories.filter(
    (c) => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.categoryCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Categories & Subcategories</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Categories containing active products cannot be deleted until products are reassigned.
        </p>
      </div>

      <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <input
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          placeholder="New category name*"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
        />
        <input
          value={catDesc}
          onChange={(e) => setCatDesc(e.target.value)}
          placeholder="Description (optional)"
          className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Create Category
        </button>
      </form>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search categories..."
        className="w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((c) => {
          const prodCount = db.products.filter((p) => p.categoryId === c.id).length;
          const subs = db.subcategories.filter((s) => s.categoryId === c.id);
          return (
            <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</div>
                  <div className="text-xs text-slate-500 font-mono-num">
                    {c.categoryCode} · {prodCount} product(s)
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete category ${c.name}`}
                  onClick={() => {
                    if (prodCount > 0) {
                      onNotify(`Blocked: "${c.name}" has ${prodCount} assigned product(s). Reassign products first.`, true);
                      return;
                    }
                    onRequireAuth('CATEGORY_SENSITIVE', c.categoryCode, () => {
                      onUpdateDb((prev) => ({
                        ...prev,
                        categories: prev.categories.filter((x) => x.id !== c.id),
                        subcategories: prev.subcategories.filter((s) => s.categoryId !== c.id),
                      }));
                      onNotify('Category deleted.');
                    });
                  }}
                  className="text-red-600 dark:text-red-400 hover:opacity-80"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Subcategories ({subs.length})
                </div>
                {subs.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-700 dark:text-slate-300">
                    {subs.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 border-b border-slate-300 dark:border-slate-700 pb-0.5">
                        {s.name} ({s.subcategoryCode})
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <input
                    value={subNames[c.id] ?? ''}
                    onChange={(e) => setSubNames({ ...subNames, [c.id]: e.target.value })}
                    placeholder="Add subcategory..."
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = (subNames[c.id] ?? '').trim();
                      if (!val) return;
                      onUpdateDb((prev) => {
                        const code = nextSequentialCode('SUB', prev.subcategories.map((x) => x.subcategoryCode), 3);
                        const sub: Subcategory = {
                          id: `sub-${Date.now()}`,
                          subcategoryCode: code,
                          categoryId: c.id,
                          name: val,
                          createdAt: Date.now(),
                        };
                        return { ...prev, subcategories: [...prev.subcategories, sub] };
                      });
                      setSubNames({ ...subNames, [c.id]: '' });
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Add Sub
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StockView({ db }: { db: RetailDatabase }) {
  const currency = db.settings.currencySymbol;
  const totalValuation = round2(db.products.reduce((acc, p) => acc + p.currentStock * p.purchasePrice, 0));
  const totalRetailValue = round2(db.products.reduce((acc, p) => acc + p.currentStock * p.sellingPrice, 0));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Stock & Inventory Movements</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Real-time inventory ledger synchronized with sales, exchanges, and manual adjustments.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Inventory Cost Valuation</div>
          <div className="mt-1 text-lg font-bold font-mono-num">{formatMoney(totalValuation, currency)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Potential Retail Value</div>
          <div className="mt-1 text-lg font-bold font-mono-num text-teal-700 dark:text-teal-400">{formatMoney(totalRetailValue, currency)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Total Movements Logged</div>
          <div className="mt-1 text-lg font-bold font-mono-num">{db.stockMovements.length}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Date / Time</th>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold text-right">Change</th>
              <th className="px-4 py-3 font-semibold text-right">Prev → New</th>
              <th className="px-4 py-3 font-semibold">Reference / Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.stockMovements.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No stock movements recorded yet.</td></tr>
            ) : (
              db.stockMovements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5 font-mono-num text-slate-500 whitespace-nowrap">{formatDhakaDateTime(m.createdAt)}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{m.productName}</td>
                  <td className="px-4 py-2.5 font-mono-num">{m.movementType}</td>
                  <td className={`px-4 py-2.5 text-right font-mono-num font-semibold ${m.quantity >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.previousStock} → {m.newStock}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{m.referenceBillId ? `${m.referenceBillId} · ` : ''}{m.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

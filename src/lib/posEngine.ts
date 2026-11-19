// Pure offline retail domain engine shared across UI and unit tests

export type LanguageCode = 'en' | 'bn';
export type PaperWidthMm = 58 | 80;
export type SaleStatus = 'COMPLETED' | 'EXCHANGED' | 'CANCELLED';
export type MovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE'
  | 'ADJUSTMENT'
  | 'EXCHANGE_RETURN'
  | 'EXCHANGE_OUT';

export type ProtectedActionKey =
  | 'REMOVE_CART_ITEM'
  | 'REDUCE_CART_QTY'
  | 'CLEAR_CART'
  | 'APPLY_DISCOUNT'
  | 'CANCEL_BILL'
  | 'OVERRIDE_STOCK'
  | 'PRODUCT_SENSITIVE'
  | 'VENDOR_SENSITIVE'
  | 'CATEGORY_SENSITIVE'
  | 'STOCK_ADJUSTMENT'
  | 'PROCESS_EXCHANGE'
  | 'RESTORE_BACKUP'
  | 'SENSITIVE_REPORTS';

export interface Vendor {
  id: string;
  vendorCode: string;
  name: string;
  contactPerson: string;
  mobile: string;
  altPhone: string;
  address: string;
  notes: string;
  createdAt: number;
}

export interface Category {
  id: string;
  categoryCode: string;
  name: string;
  description: string;
  createdAt: number;
}

export interface Subcategory {
  id: string;
  subcategoryCode: string;
  categoryId: string;
  name: string;
  createdAt: number;
}

export interface Product {
  id: string;
  productCode: string;
  vendorId: string;
  categoryId: string;
  subcategoryId: string | null;
  barcode: string;
  name: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  gpAmount: number;
  gpPercentage: number;
  currentStock: number;
  minStockAlert: number;
  unit: string;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  totalSpent: number;
  billCount: number;
  lastPurchaseAt: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  barcode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  purchasePriceAtSale: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  billNumber: string;
  billDateKey: string;
  customerId: string | null;
  customerName: string;
  customerMobile: string;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  grandTotal: number;
  totalQuantity: number;
  status: SaleStatus;
  createdAt: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  movementType: MovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceBillId: string;
  authorizedByAdmin: boolean;
  note: string;
  createdAt: number;
}

export interface ExchangeItem {
  productId: string;
  productName: string;
  barcode: string;
  direction: 'RETURNED' | 'REPLACEMENT';
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ExchangeRecord {
  id: string;
  exchangeNumber: string;
  originalSaleId: string;
  originalBillNumber: string;
  returnedItems: ExchangeItem[];
  replacementItems: ExchangeItem[];
  returnedTotal: number;
  replacementTotal: number;
  netDifference: number;
  reason: string;
  authorizedByAdmin: boolean;
  createdAt: number;
}

export interface AuditLog {
  id: string;
  actionType: string;
  targetReference: string;
  details: string;
  createdAt: number;
}

export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  currencySymbol: string;
  language: LanguageCode;
  darkTheme: boolean;
  paperWidthMm: PaperWidthMm;
  lastPrinterName: string;
  lastPrinterAddress: string;
  autoPrintReceipt: boolean;
  lowStockAlertEnabled: boolean;
  englishReturnPolicy: string;
  banglaReturnPolicy: string;
  receiptFooterNote: string;
  adminPasswordHash: string;
  adminPasswordSalt: string;
  protectProductOps: boolean;
  protectVendorOps: boolean;
  protectCategoryOps: boolean;
  protectStockAdjust: boolean;
  protectPosRemoval: boolean;
  protectPosDiscount: boolean;
  protectBillCancel: boolean;
  protectSensitiveReports: boolean;
}

export interface RetailDatabase {
  vendors: Vendor[];
  categories: Category[];
  subcategories: Subcategory[];
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  stockMovements: StockMovement[];
  exchanges: ExchangeRecord[];
  auditLogs: AuditLog[];
  settings: AppSettings;
}

export interface CartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export const ENGLISH_POLICY_DEFAULT =
  'Products may be exchanged within 3 days of purchase with the original bill. No cash refund is available.';
export const BANGLA_POLICY_DEFAULT =
  'ক্রয়ের ৩ দিনের মধ্যে মূল বিলসহ পণ্য এক্সচেঞ্জ করা যাবে। কোনো নগদ টাকা ফেরত দেওয়া হবে না।';

export function createDefaultSettings(): AppSettings {
  return {
    storeName: 'BazarPOS Retail Store',
    storeAddress: 'House 24, Dhanmondi, Dhaka 1209',
    storePhone: '+880 1711-000000',
    currencySymbol: '৳',
    language: 'en',
    darkTheme: false,
    paperWidthMm: 58,
    lastPrinterName: '',
    lastPrinterAddress: '',
    autoPrintReceipt: true,
    lowStockAlertEnabled: true,
    englishReturnPolicy: ENGLISH_POLICY_DEFAULT,
    banglaReturnPolicy: BANGLA_POLICY_DEFAULT,
    receiptFooterNote: 'Thank you for shopping with us!',
    adminPasswordHash: '',
    adminPasswordSalt: '',
    protectProductOps: true,
    protectVendorOps: true,
    protectCategoryOps: true,
    protectStockAdjust: true,
    protectPosRemoval: true,
    protectPosDiscount: true,
    protectBillCancel: true,
    protectSensitiveReports: false,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateGp(purchasePrice: number, sellingPrice: number): { gpAmount: number; gpPercentage: number } {
  const safePurchase = Math.max(0, Number.isFinite(purchasePrice) ? purchasePrice : 0);
  const safeSelling = Math.max(0, Number.isFinite(sellingPrice) ? sellingPrice : 0);
  const gpAmount = round2(safeSelling - safePurchase);
  const gpPercentage = safeSelling > 0 ? round2((gpAmount / safeSelling) * 100) : 0;
  return { gpAmount, gpPercentage };
}

export function getDhakaDateKey(epochMillis: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMillis));
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}${m}${d}`;
}

export function formatDhakaDateTime(epochMillis: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(epochMillis));
}

export function formatMoney(amount: number, symbol = '৳'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function nextSequentialCode(prefix: string, existingCodes: string[], padWidth = 4): string {
  let max = 0;
  for (const code of existingCodes) {
    const seg = code.split('-')[1];
    const num = seg ? Number.parseInt(seg, 10) : 0;
    if (Number.isFinite(num) && num > max) {
      max = num;
    }
  }
  return `${prefix}-${String(max + 1).padStart(padWidth, '0')}`;
}

export function generateBillNumber(dateKey: string, existingSales: Pick<Sale, 'billDateKey' | 'billNumber'>[]): string {
  let maxSerial = 0;
  for (const s of existingSales) {
    if (s.billDateKey === dateKey) {
      const parts = s.billNumber.split('-');
      const serial = parts[1] ? Number.parseInt(parts[1], 10) : 0;
      if (Number.isFinite(serial) && serial > maxSerial) {
        maxSerial = serial;
      }
    }
  }
  return `${dateKey}-${String(maxSerial + 1).padStart(3, '0')}`;
}

export function isEligibleForExchange(saleCreatedAt: number, nowMillis: number = Date.now()): boolean {
  const saleKey = getDhakaDateKey(saleCreatedAt);
  const nowKey = getDhakaDateKey(nowMillis);
  const saleUtc = Date.UTC(
    Number(saleKey.slice(0, 4)),
    Number(saleKey.slice(4, 6)) - 1,
    Number(saleKey.slice(6, 8))
  );
  const nowUtc = Date.UTC(
    Number(nowKey.slice(0, 4)),
    Number(nowKey.slice(4, 6)) - 1,
    Number(nowKey.slice(6, 8))
  );
  const diffDays = Math.floor((nowUtc - saleUtc) / 86400000);
  return diffDays >= 0 && diffDays <= 3;
}

// Deterministic pure-TS salted password hashing (FNV/SHA-like iterated mixing; Web + Node compatible offline)
export function createSalt(seed?: string): string {
  if (seed) return seed;
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashPassword(password: string, salt: string): string {
  // 2048-round deterministic bit-mixing digest so passwords are never stored in plain text
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = `${salt}::${password}::BazarPOS`;
  for (let round = 0; round < 2048; round++) {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 ^= c + ((round * 31) & 0xff);
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= (c << 3) ^ (h1 >>> 5);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    h1 ^= h2 >>> 13;
    h2 ^= h1 >>> 11;
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  if (!storedHash || !salt) return false;
  const candidate = hashPassword(password, salt);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export function requiresAdminAuthorization(settings: AppSettings, action: ProtectedActionKey): boolean {
  if (!settings.adminPasswordHash) return false;
  switch (action) {
    case 'REMOVE_CART_ITEM':
    case 'REDUCE_CART_QTY':
    case 'CLEAR_CART':
      return settings.protectPosRemoval;
    case 'APPLY_DISCOUNT':
      return settings.protectPosDiscount;
    case 'CANCEL_BILL':
      return settings.protectBillCancel;
    case 'PRODUCT_SENSITIVE':
      return settings.protectProductOps;
    case 'VENDOR_SENSITIVE':
      return settings.protectVendorOps;
    case 'CATEGORY_SENSITIVE':
      return settings.protectCategoryOps;
    case 'STOCK_ADJUSTMENT':
      return settings.protectStockAdjust;
    case 'SENSITIVE_REPORTS':
      return settings.protectSensitiveReports;
    case 'OVERRIDE_STOCK':
    case 'PROCESS_EXCHANGE':
    case 'RESTORE_BACKUP':
      return true;
  }
}

export function computeCartTotals(
  cart: CartItem[],
  productsById: Map<string, Product>,
  discountAmount: number
): { subtotal: number; discount: number; grandTotal: number; totalQuantity: number } {
  let subtotal = 0;
  let totalQuantity = 0;
  for (const item of cart) {
    if (!productsById.has(item.productId)) continue;
    subtotal += round2(item.unitPrice * item.quantity);
    totalQuantity += item.quantity;
  }
  subtotal = round2(subtotal);
  const safeDiscount = round2(Math.min(Math.max(0, discountAmount), subtotal));
  const grandTotal = round2(subtotal - safeDiscount);
  return { subtotal, discount: safeDiscount, grandTotal, totalQuantity };
}

export function executeSaleTransaction(
  db: RetailDatabase,
  input: {
    cart: CartItem[];
    discountAmount: number;
    customerName: string;
    customerMobile: string;
    allowOverStockOverride?: boolean;
    nowMillis?: number;
  }
): { ok: true; db: RetailDatabase; sale: Sale } | { ok: false; error: string } {
  if (input.cart.length === 0) {
    return { ok: false, error: 'Cart is empty.' };
  }

  const now = input.nowMillis ?? Date.now();
  const dateKey = getDhakaDateKey(now);
  const billNumber = generateBillNumber(dateKey, db.sales);
  const productMap = new Map(db.products.map((p) => [p.id, p]));

  const saleItems: SaleItem[] = [];
  const nextProducts = db.products.map((p) => ({ ...p }));
  const nextProductMap = new Map(nextProducts.map((p) => [p.id, p]));
  const newMovements: StockMovement[] = [];

  for (const line of input.cart) {
    const prod = nextProductMap.get(line.productId);
    if (!prod) {
      return { ok: false, error: 'One or more products in the cart no longer exist.' };
    }
    if (line.quantity <= 0) {
      return { ok: false, error: `Invalid quantity for ${prod.name}.` };
    }
    if (!input.allowOverStockOverride && line.quantity > prod.currentStock) {
      return {
        ok: false,
        error: `Insufficient stock for ${prod.name} (Available: ${prod.currentStock} ${prod.unit}).`,
      };
    }

    const lineSubtotal = round2(line.unitPrice * line.quantity);
    saleItems.push({
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      unit: prod.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      purchasePriceAtSale: prod.purchasePrice,
      subtotal: lineSubtotal,
    });

    const previousStock = prod.currentStock;
    const newStock = Math.max(0, round2(previousStock - line.quantity));
    prod.currentStock = newStock;

    newMovements.push({
      id: `mov-${now}-${Math.random().toString(36).slice(2, 7)}`,
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      movementType: 'SALE',
      quantity: -line.quantity,
      previousStock,
      newStock,
      referenceBillId: billNumber,
      authorizedByAdmin: Boolean(input.allowOverStockOverride),
      note: `POS Sale ${billNumber}`,
      createdAt: now,
    });
  }

  const totals = computeCartTotals(input.cart, productMap, input.discountAmount);
  const cleanName = input.customerName.trim();
  const cleanMobile = input.customerMobile.trim();

  let customerId: string | null = null;
  const nextCustomers = db.customers.map((c) => ({ ...c }));
  if (cleanMobile) {
    const existingCustomer = nextCustomers.find((c) => c.mobile === cleanMobile);
    if (existingCustomer) {
      existingCustomer.name = cleanName || existingCustomer.name;
      existingCustomer.totalSpent = round2(existingCustomer.totalSpent + totals.grandTotal);
      existingCustomer.billCount += 1;
      existingCustomer.lastPurchaseAt = now;
      customerId = existingCustomer.id;
    } else {
      customerId = `cust-${now}-${Math.random().toString(36).slice(2, 6)}`;
      nextCustomers.unshift({
        id: customerId,
        name: cleanName || 'Walk-in Customer',
        mobile: cleanMobile,
        totalSpent: totals.grandTotal,
        billCount: 1,
        lastPurchaseAt: now,
      });
    }
  }

  const sale: Sale = {
    id: `sale-${now}-${Math.random().toString(36).slice(2, 7)}`,
    billNumber,
    billDateKey: dateKey,
    customerId,
    customerName: cleanName,
    customerMobile: cleanMobile,
    items: saleItems,
    subtotal: totals.subtotal,
    discountAmount: totals.discount,
    grandTotal: totals.grandTotal,
    totalQuantity: totals.totalQuantity,
    status: 'COMPLETED',
    createdAt: now,
  };

  const nextAuditLogs = [...db.auditLogs];
  if (totals.discount > 0) {
    nextAuditLogs.unshift({
      id: `aud-${now}-disc`,
      actionType: 'POS_DISCOUNT',
      targetReference: billNumber,
      details: `Authorized discount of ${formatMoney(totals.discount, db.settings.currencySymbol)} on ${billNumber}`,
      createdAt: now,
    });
  }

  return {
    ok: true,
    sale,
    db: {
      ...db,
      products: nextProducts,
      customers: nextCustomers,
      sales: [sale, ...db.sales],
      stockMovements: [...newMovements, ...db.stockMovements],
      auditLogs: nextAuditLogs,
    },
  };
}

export function executeExchangeTransaction(
  db: RetailDatabase,
  input: {
    originalSaleId: string;
    returnedItems: { productId: string; quantity: number }[];
    replacementItems: { productId: string; quantity: number }[];
    reason: string;
    nowMillis?: number;
  }
): { ok: true; db: RetailDatabase; exchange: ExchangeRecord } | { ok: false; error: string } {
  const now = input.nowMillis ?? Date.now();
  const originalSale = db.sales.find((s) => s.id === input.originalSaleId);
  if (!originalSale) {
    return { ok: false, error: 'Original bill not found.' };
  }
  if (originalSale.status === 'CANCELLED') {
    return { ok: false, error: 'Cancelled bills cannot be exchanged.' };
  }
  if (!isEligibleForExchange(originalSale.createdAt, now)) {
    return { ok: false, error: 'Exchange window expired (must be within 3 days of purchase).' };
  }
  if (input.returnedItems.length === 0) {
    return { ok: false, error: 'Select at least one returned item.' };
  }

  const nextProducts = db.products.map((p) => ({ ...p }));
  const productMap = new Map(nextProducts.map((p) => [p.id, p]));
  const newMovements: StockMovement[] = [];
  const exNumber = `EXC-${getDhakaDateKey(now)}-${String(db.exchanges.length + 1).padStart(3, '0')}`;

  const returnedEntries: ExchangeItem[] = [];
  let returnedTotal = 0;

  for (const ret of input.returnedItems) {
    const soldItem = originalSale.items.find((i) => i.productId === ret.productId);
    if (!soldItem || ret.quantity <= 0 || ret.quantity > soldItem.quantity) {
      return { ok: false, error: 'Returned quantity exceeds original bill quantity.' };
    }
    const prod = productMap.get(ret.productId);
    if (!prod) {
      return { ok: false, error: 'Returned product record not found.' };
    }
    const lineSub = round2(soldItem.unitPrice * ret.quantity);
    returnedTotal += lineSub;
    returnedEntries.push({
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      direction: 'RETURNED',
      quantity: ret.quantity,
      unitPrice: soldItem.unitPrice,
      subtotal: lineSub,
    });
    const prev = prod.currentStock;
    prod.currentStock = round2(prev + ret.quantity);
    newMovements.push({
      id: `mov-${now}-ret-${prod.id}`,
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      movementType: 'EXCHANGE_RETURN',
      quantity: ret.quantity,
      previousStock: prev,
      newStock: prod.currentStock,
      referenceBillId: originalSale.billNumber,
      authorizedByAdmin: true,
      note: `Returned under ${exNumber}`,
      createdAt: now,
    });
  }

  const replacementEntries: ExchangeItem[] = [];
  let replacementTotal = 0;
  for (const rep of input.replacementItems) {
    if (rep.quantity <= 0) continue;
    const prod = productMap.get(rep.productId);
    if (!prod) {
      return { ok: false, error: 'Replacement product not found.' };
    }
    if (rep.quantity > prod.currentStock) {
      return { ok: false, error: `Insufficient stock for replacement ${prod.name}.` };
    }
    const lineSub = round2(prod.sellingPrice * rep.quantity);
    replacementTotal += lineSub;
    replacementEntries.push({
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      direction: 'REPLACEMENT',
      quantity: rep.quantity,
      unitPrice: prod.sellingPrice,
      subtotal: lineSub,
    });
    const prev = prod.currentStock;
    prod.currentStock = round2(prev - rep.quantity);
    newMovements.push({
      id: `mov-${now}-rep-${prod.id}`,
      productId: prod.id,
      productName: prod.name,
      barcode: prod.barcode,
      movementType: 'EXCHANGE_OUT',
      quantity: -rep.quantity,
      previousStock: prev,
      newStock: prod.currentStock,
      referenceBillId: originalSale.billNumber,
      authorizedByAdmin: true,
      note: `Replacement under ${exNumber}`,
      createdAt: now,
    });
  }

  returnedTotal = round2(returnedTotal);
  replacementTotal = round2(replacementTotal);
  const netDifference = round2(replacementTotal - returnedTotal);

  if (netDifference < 0) {
    return {
      ok: false,
      error: 'No cash refund is available. Replacement total must equal or exceed returned total.',
    };
  }

  const exchange: ExchangeRecord = {
    id: `exc-${now}`,
    exchangeNumber: exNumber,
    originalSaleId: originalSale.id,
    originalBillNumber: originalSale.billNumber,
    returnedItems: returnedEntries,
    replacementItems: replacementEntries,
    returnedTotal,
    replacementTotal,
    netDifference,
    reason: input.reason.trim() || 'Customer product exchange',
    authorizedByAdmin: true,
    createdAt: now,
  };

  const nextSales = db.sales.map((s) =>
    s.id === originalSale.id ? { ...s, status: 'EXCHANGED' as SaleStatus } : s
  );

  const audit: AuditLog = {
    id: `aud-${now}-exc`,
    actionType: 'EXCHANGE_PROCESSED',
    targetReference: originalSale.billNumber,
    details: `${exNumber} linked to ${originalSale.billNumber} (Net payable: ${formatMoney(netDifference, db.settings.currencySymbol)})`,
    createdAt: now,
  };

  return {
    ok: true,
    exchange,
    db: {
      ...db,
      products: nextProducts,
      sales: nextSales,
      exchanges: [exchange, ...db.exchanges],
      stockMovements: [...newMovements, ...db.stockMovements],
      auditLogs: [audit, ...db.auditLogs],
    },
  };
}

export function buildThermalReceiptText(sale: Sale, settings: AppSettings): string {
  const cols = settings.paperWidthMm >= 80 ? 44 : 32;
  const sep = '-'.repeat(cols);
  const pad = (l: string, r: string) => `${l}${' '.repeat(Math.max(1, cols - l.length - r.length))}${r}`;
  const lines: string[] = [
    settings.storeName,
    settings.storeAddress,
    `Tel: ${settings.storePhone}`,
    sep,
    `Bill: ${sale.billNumber}`,
    `Date: ${formatDhakaDateTime(sale.createdAt)}`,
  ];
  if (sale.customerName || sale.customerMobile) {
    lines.push(`Cust: ${sale.customerName} ${sale.customerMobile}`.trim());
  }
  lines.push(sep);
  for (const item of sale.items) {
    lines.push(item.productName);
    lines.push(pad(`  ${item.quantity} x ${item.unitPrice.toFixed(2)}`, item.subtotal.toFixed(2)));
  }
  lines.push(sep);
  lines.push(pad('Total Qty:', String(sale.totalQuantity)));
  lines.push(pad('Subtotal:', formatMoney(sale.subtotal, settings.currencySymbol)));
  if (sale.discountAmount > 0) {
    lines.push(pad('Discount:', `-${formatMoney(sale.discountAmount, settings.currencySymbol)}`));
  }
  lines.push(pad('GRAND TOTAL:', formatMoney(sale.grandTotal, settings.currencySymbol)));
  lines.push(sep);
  lines.push(settings.receiptFooterNote);
  lines.push('');
  lines.push(settings.englishReturnPolicy);
  lines.push('');
  lines.push(settings.banglaReturnPolicy);
  return lines.join('\n');
}

export function computeSalesMetrics(sales: Sale[], fromMillis: number, toMillis: number) {
  const valid = sales.filter(
    (s) => s.status !== 'CANCELLED' && s.createdAt >= fromMillis && s.createdAt <= toMillis
  );
  const totalSales = round2(valid.reduce((acc, s) => acc + s.grandTotal, 0));
  const totalBills = valid.length;
  const totalItemsSold = valid.reduce((acc, s) => acc + s.totalQuantity, 0);
  const avgBillValue = totalBills > 0 ? round2(totalSales / totalBills) : 0;
  const avgBasketSize = totalBills > 0 ? round2(totalItemsSold / totalBills) : 0;
  const totalProfit = round2(
    valid.reduce((acc, s) => {
      const itemProfit = s.items.reduce(
        (ia, item) => ia + (item.unitPrice - item.purchasePriceAtSale) * item.quantity,
        0
      );
      return acc + itemProfit - s.discountAmount;
    }, 0)
  );
  return { totalSales, totalBills, totalItemsSold, avgBillValue, avgBasketSize, totalProfit };
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))];
  return '\uFEFF' + lines.join('\n');
}

export function createEmptyDatabase(): RetailDatabase {
  return {
    vendors: [],
    categories: [],
    subcategories: [],
    products: [],
    customers: [],
    sales: [],
    stockMovements: [],
    exchanges: [],
    auditLogs: [],
    settings: createDefaultSettings(),
  };
}

export function createStarterCatalogDatabase(adminPassword: string): RetailDatabase {
  const now = Date.now();
  const salt = createSalt('bazarpos-starter-salt');
  const hash = hashPassword(adminPassword, salt);
  const settings: AppSettings = {
    ...createDefaultSettings(),
    adminPasswordHash: hash,
    adminPasswordSalt: salt,
  };

  const vendors: Vendor[] = [
    {
      id: 'vnd-1',
      vendorCode: 'VND-0001',
      name: 'Meghna Consumer Goods Ltd.',
      contactPerson: 'Rafiqul Islam',
      mobile: '01711-223344',
      altPhone: '01819-556677',
      address: 'Tejgaon Industrial Area, Dhaka',
      notes: 'FMCG & Grocery wholesale supplier',
      createdAt: now,
    },
    {
      id: 'vnd-2',
      vendorCode: 'VND-0002',
      name: 'Padma Apparels & Essentials',
      contactPerson: 'Nusrat Jahan',
      mobile: '01912-889900',
      altPhone: '',
      address: 'New Market, Dhaka',
      notes: 'Daily essentials & personal care',
      createdAt: now,
    },
  ];

  const categories: Category[] = [
    { id: 'cat-1', categoryCode: 'CAT-001', name: 'Groceries & Staples', description: 'Rice, oil, tea, and packaged staples', createdAt: now },
    { id: 'cat-2', categoryCode: 'CAT-002', name: 'Beverages & Snacks', description: 'Tea, juice, biscuits, snacks', createdAt: now },
    { id: 'cat-3', categoryCode: 'CAT-003', name: 'Personal Care', description: 'Soap, shampoo, hygiene items', createdAt: now },
  ];

  const subcategories: Subcategory[] = [
    { id: 'sub-1', subcategoryCode: 'SUB-001', categoryId: 'cat-1', name: 'Cooking Oil', createdAt: now },
    { id: 'sub-2', subcategoryCode: 'SUB-002', categoryId: 'cat-2', name: 'Tea & Coffee', createdAt: now },
    { id: 'sub-3', subcategoryCode: 'SUB-003', categoryId: 'cat-3', name: 'Bath & Body', createdAt: now },
  ];

  const rawProducts: Array<Omit<Product, 'gpAmount' | 'gpPercentage'>> = [
    {
      id: 'prd-1',
      productCode: 'PRD-0001',
      vendorId: 'vnd-1',
      categoryId: 'cat-1',
      subcategoryId: 'sub-1',
      barcode: '8901058001129',
      name: 'Rupchanda Soyabean Oil 1L',
      description: 'Fortified refined soyabean oil',
      purchasePrice: 155,
      sellingPrice: 175,
      currentStock: 24,
      minStockAlert: 5,
      unit: 'litre',
      createdAt: now,
    },
    {
      id: 'prd-2',
      productCode: 'PRD-0002',
      vendorId: 'vnd-1',
      categoryId: 'cat-2',
      subcategoryId: 'sub-2',
      barcode: '8941100512345',
      name: 'Ispahani Mirzapore Tea 400g',
      description: 'Premium Sylhet leaf blend',
      purchasePrice: 185,
      sellingPrice: 220,
      currentStock: 18,
      minStockAlert: 5,
      unit: 'packet',
      createdAt: now,
    },
    {
      id: 'prd-3',
      productCode: 'PRD-0003',
      vendorId: 'vnd-1',
      categoryId: 'cat-1',
      subcategoryId: null,
      barcode: '8941100598762',
      name: 'Aarong Miniket Rice 5kg',
      description: 'Premium aged miniket rice pack',
      purchasePrice: 360,
      sellingPrice: 410,
      currentStock: 4,
      minStockAlert: 5,
      unit: 'packet',
      createdAt: now,
    },
    {
      id: 'prd-4',
      productCode: 'PRD-0004',
      vendorId: 'vnd-2',
      categoryId: 'cat-3',
      subcategoryId: 'sub-3',
      barcode: '8901030865432',
      name: 'Lux Velvet Touch Soap 150g',
      description: 'Jasmine & Vitamin E bath bar',
      purchasePrice: 48,
      sellingPrice: 60,
      currentStock: 35,
      minStockAlert: 8,
      unit: 'piece',
      createdAt: now,
    },
    {
      id: 'prd-5',
      productCode: 'PRD-0005',
      vendorId: 'vnd-2',
      categoryId: 'cat-2',
      subcategoryId: null,
      barcode: '8941190110022',
      name: 'Olympic Energy Plus Biscuit',
      description: 'Family pack 250g',
      purchasePrice: 32,
      sellingPrice: 40,
      currentStock: 0,
      minStockAlert: 6,
      unit: 'packet',
      createdAt: now,
    },
  ];

  const products: Product[] = rawProducts.map((p) => ({
    ...p,
    ...calculateGp(p.purchasePrice, p.sellingPrice),
  }));

  const stockMovements: StockMovement[] = products
    .filter((p) => p.currentStock > 0)
    .map((p) => ({
      id: `mov-init-${p.id}`,
      productId: p.id,
      productName: p.name,
      barcode: p.barcode,
      movementType: 'INITIAL',
      quantity: p.currentStock,
      previousStock: 0,
      newStock: p.currentStock,
      referenceBillId: '',
      authorizedByAdmin: false,
      note: 'Starter catalog initial stock',
      createdAt: now,
    }));

  return {
    vendors,
    categories,
    subcategories,
    products,
    customers: [],
    sales: [],
    stockMovements,
    exchanges: [],
    auditLogs: [
      {
        id: `aud-${now}`,
        actionType: 'ADMIN_PASSWORD_CREATED',
        targetReference: 'SETTINGS',
        details: 'Initial administrator password configured',
        createdAt: now,
      },
    ],
    settings,
  };
}

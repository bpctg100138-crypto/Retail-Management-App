import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGp,
  createStarterCatalogDatabase,
  executeExchangeTransaction,
  executeSaleTransaction,
  generateBillNumber,
  getDhakaDateKey,
  hashPassword,
  isEligibleForExchange,
  verifyPassword,
  buildThermalReceiptText,
} from './posEngine';

test('GP calculation handles normal prices and prevents division by zero', () => {
  const normal = calculateGp(120, 150);
  assert.equal(normal.gpAmount, 30);
  assert.equal(normal.gpPercentage, 20);

  const zeroSell = calculateGp(50, 0);
  assert.equal(zeroSell.gpAmount, -50);
  assert.equal(zeroSell.gpPercentage, 0);
});

test('Bill numbering follows YYYYMMDD-001 and resets daily', () => {
  assert.equal(generateBillNumber('20261119', []), '20261119-001');
  assert.equal(
    generateBillNumber('20261119', [
      { billDateKey: '20261119', billNumber: '20261119-001' },
      { billDateKey: '20261119', billNumber: '20261119-002' },
    ]),
    '20261119-003'
  );
  assert.equal(
    generateBillNumber('20261120', [{ billDateKey: '20261119', billNumber: '20261119-009' }]),
    '20261120-001'
  );
});

test('Salted password hashing verifies valid passwords and rejects invalid ones', () => {
  const salt = 'test-salt-123';
  const hash = hashPassword('Dhaka@2026', salt);
  assert.notEqual(hash, 'Dhaka@2026');
  assert.equal(verifyPassword('Dhaka@2026', hash, salt), true);
  assert.equal(verifyPassword('wrong-pass', hash, salt), false);
});

test('Sale transaction deducts stock, logs movement, records customer, and prints EN/BN policy', () => {
  const db = createStarterCatalogDatabase('1234');
  const now = Date.UTC(2026, 10, 19, 6, 0, 0); // 12:00 PM Asia/Dhaka on 2026-11-19
  const res = executeSaleTransaction(db, {
    cart: [{ productId: 'prd-1', quantity: 2, unitPrice: 175 }],
    discountAmount: 10,
    customerName: 'Tariqul Hasan',
    customerMobile: '01755-112233',
    nowMillis: now,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.equal(res.sale.billNumber, `${getDhakaDateKey(now)}-001`);
  assert.equal(res.sale.subtotal, 350);
  assert.equal(res.sale.grandTotal, 340);

  const updatedOil = res.db.products.find((p) => p.id === 'prd-1');
  assert.equal(updatedOil?.currentStock, 22);
  assert.equal(res.db.customers.length, 1);
  assert.equal(res.db.customers[0].totalSpent, 340);

  const receipt = buildThermalReceiptText(res.sale, res.db.settings);
  assert.match(receipt, /Products may be exchanged within 3 days/);
  assert.match(receipt, /ক্রয়ের ৩ দিনের মধ্যে মূল বিলসহ পণ্য এক্সচেঞ্জ/);
});

test('3-day exchange eligibility and stock synchronization block cash refunds', () => {
  const db = createStarterCatalogDatabase('1234');
  const saleTime = Date.UTC(2026, 10, 15, 6, 0, 0);
  const saleRes = executeSaleTransaction(db, {
    cart: [{ productId: 'prd-2', quantity: 1, unitPrice: 220 }], // 220 BDT
    discountAmount: 0,
    customerName: '',
    customerMobile: '',
    nowMillis: saleTime,
  });
  assert.equal(saleRes.ok, true);
  if (!saleRes.ok) return;

  const twoDaysLater = saleTime + 2 * 86400000;
  const fourDaysLater = saleTime + 4 * 86400000;
  assert.equal(isEligibleForExchange(saleTime, twoDaysLater), true);
  assert.equal(isEligibleForExchange(saleTime, fourDaysLater), false);

  // Trying to exchange 220 BDT tea for 60 BDT soap must fail (no cash refund)
  const badExchange = executeExchangeTransaction(saleRes.db, {
    originalSaleId: saleRes.sale.id,
    returnedItems: [{ productId: 'prd-2', quantity: 1 }],
    replacementItems: [{ productId: 'prd-4', quantity: 1 }],
    reason: 'Wrong item',
    nowMillis: twoDaysLater,
  });
  assert.equal(badExchange.ok, false);

  // Exchanging 220 BDT tea for 410 BDT rice succeeds and updates stock of both
  const goodExchange = executeExchangeTransaction(saleRes.db, {
    originalSaleId: saleRes.sale.id,
    returnedItems: [{ productId: 'prd-2', quantity: 1 }],
    replacementItems: [{ productId: 'prd-3', quantity: 1 }],
    reason: 'Upgraded to rice pack',
    nowMillis: twoDaysLater,
  });
  assert.equal(goodExchange.ok, true);
  if (!goodExchange.ok) return;

  assert.equal(goodExchange.exchange.netDifference, 190);
  assert.equal(goodExchange.db.products.find((p) => p.id === 'prd-2')?.currentStock, 18);
  assert.equal(goodExchange.db.products.find((p) => p.id === 'prd-3')?.currentStock, 3);
  assert.equal(goodExchange.db.sales[0].status, 'EXCHANGED');
});

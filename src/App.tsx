import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Download,
  FolderTree,
  LayoutDashboard,
  Moon,
  Package,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Smartphone,
  Sun,
  Truck,
} from 'lucide-react';
import {
  CartItem,
  createEmptyDatabase,
  createSalt,
  createStarterCatalogDatabase,
  executeSaleTransaction,
  hashPassword,
  Product,
  ProtectedActionKey,
  requiresAdminAuthorization,
  RetailDatabase,
  Sale,
  verifyPassword,
} from './lib/posEngine';
import { t } from './lib/i18n';
import { SetupScreen } from './components/SetupScreen';
import { DashboardView, NavRoute } from './components/DashboardView';
import { PosView } from './components/PosView';
import { CategoriesView, ProductsView, StockView, VendorsView } from './components/CatalogViews';
import { AndroidProjectView, BillHistoryView, ReportsView, SettingsView } from './components/OperationsViews';
import { AdminAuthModal, ThermalReceiptModal } from './components/Modals';

const STORAGE_KEY = 'bazarpos_offline_db_v1';

function loadInitialDatabase(): RetailDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RetailDatabase;
      if (parsed && parsed.settings && Array.isArray(parsed.products)) {
        return parsed;
      }
    }
  } catch {
    // Fall through to fresh initialization
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') === '1') {
    return createStarterCatalogDatabase('1234');
  }
  return createEmptyDatabase();
}

export default function App() {
  const [db, setDb] = useState<RetailDatabase>(() => loadInitialDatabase());
  const [route, setRoute] = useState<NavRoute>('dashboard');

  // POS Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');

  // Dialogs & notifications
  const [authState, setAuthState] = useState<{
    action: ProtectedActionKey;
    ref: string;
    onAuthorized: () => void;
  } | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [toast, setToast] = useState<{ msg: string; isError: boolean } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Storage quota safeguard
    }
  }, [db]);

  useEffect(() => {
    const root = document.documentElement;
    if (db.settings.darkTheme) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [db.settings.darkTheme]);

  const notify = (msg: string, isError = false) => {
    setToast({ msg, isError });
    window.setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 3500);
  };

  const requireAuth = (action: ProtectedActionKey, ref: string, onAuthorized: () => void) => {
    if (!requiresAdminAuthorization(db.settings, action)) {
      onAuthorized();
      return;
    }
    setAuthState({ action, ref, onAuthorized });
  };

  const handleVerifyAuth = (password: string): boolean => {
    if (!authState) return false;
    const ok = verifyPassword(password, db.settings.adminPasswordHash, db.settings.adminPasswordSalt);
    if (ok) {
      const { action, ref, onAuthorized } = authState;
      setAuthState(null);
      setDb((prev) => ({
        ...prev,
        auditLogs: [
          {
            id: `aud-${Date.now()}`,
            actionType: action,
            targetReference: ref,
            details: `Admin authorized ${action}`,
            createdAt: Date.now(),
          },
          ...prev.auditLogs,
        ],
      }));
      onAuthorized();
    }
    return ok;
  };

  // First-launch password setup gate
  if (!db.settings.adminPasswordHash) {
    return (
      <SetupScreen
        onCompleteSetup={(password, includeStarter) => {
          if (includeStarter) {
            setDb(createStarterCatalogDatabase(password));
          } else {
            const salt = createSalt();
            const hash = hashPassword(password, salt);
            setDb((prev) => ({
              ...prev,
              settings: { ...prev.settings, adminPasswordHash: hash, adminPasswordSalt: salt },
              auditLogs: [
                {
                  id: `aud-${Date.now()}`,
                  actionType: 'ADMIN_PASSWORD_CREATED',
                  targetReference: 'SETTINGS',
                  details: 'Initial administrator password created',
                  createdAt: Date.now(),
                },
              ],
            }));
          }
          notify('Administrator password configured.');
        }}
      />
    );
  }

  const lang = db.settings.language;

  const navigateTo = (nextRoute: NavRoute) => {
    setRoute(nextRoute);
    setToast(null);
  };

  const navItems: { id: NavRoute; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: t(lang, 'dashboard'), icon: LayoutDashboard },
    { id: 'pos', label: t(lang, 'pos'), icon: ShoppingCart },
    { id: 'products', label: t(lang, 'products'), icon: Package },
    { id: 'vendors', label: t(lang, 'vendors'), icon: Truck },
    { id: 'categories', label: t(lang, 'categories'), icon: FolderTree },
    { id: 'stock', label: t(lang, 'stock'), icon: Boxes },
    { id: 'reports', label: t(lang, 'reports'), icon: BarChart3 },
    { id: 'bills', label: t(lang, 'bills'), icon: Receipt },
    { id: 'settings', label: t(lang, 'settings'), icon: SettingsIcon },
    { id: 'android', label: t(lang, 'androidProject'), icon: Smartphone },
  ];

  const handleAddProductToCart = (product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === product.id);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { productId: product.id, quantity: 1, unitPrice: product.sellingPrice }];
    });
  };

  const handleSetCartQty = (productId: string, newQty: number) => {
    const existing = cart.find((c) => c.productId === productId);
    const prod = db.products.find((p) => p.id === productId);
    if (!existing || !prod) return;

    if (newQty <= 0) {
      requireAuth('REMOVE_CART_ITEM', prod.name, () => {
        setCart((prev) => prev.filter((c) => c.productId !== productId));
      });
      return;
    }
    if (newQty < existing.quantity) {
      requireAuth('REDUCE_CART_QTY', `${prod.name} (${existing.quantity} → ${newQty})`, () => {
        setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, quantity: newQty } : c)));
      });
      return;
    }
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, quantity: newQty } : c)));
  };

  const handleRemoveCartItem = (productId: string) => {
    const prod = db.products.find((p) => p.id === productId);
    requireAuth('REMOVE_CART_ITEM', prod?.name ?? productId, () => {
      setCart((prev) => prev.filter((c) => c.productId !== productId));
    });
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    requireAuth('CLEAR_CART', `${cart.length} items`, () => {
      setCart([]);
      setDiscount(0);
      setCustomerName('');
      setCustomerMobile('');
    });
  };

  const handleApplyDiscount = (amount: number) => {
    requireAuth('APPLY_DISCOUNT', `${db.settings.currencySymbol}${amount}`, () => {
      setDiscount(amount);
      notify(`Discount of ${db.settings.currencySymbol}${amount} applied.`);
    });
  };

  const handleCompleteSale = (allowOverStock = false) => {
    const result = executeSaleTransaction(db, {
      cart,
      discountAmount: discount,
      customerName,
      customerMobile,
      allowOverStockOverride: allowOverStock,
    });
    if (!result.ok) {
      if (result.error.includes('Insufficient stock')) {
        requireAuth('OVERRIDE_STOCK', 'Cart Checkout', () => handleCompleteSale(true));
      } else {
        notify(result.error, true);
      }
      return;
    }
    setDb(result.db);
    setCart([]);
    setDiscount(0);
    setCustomerName('');
    setCustomerMobile('');
    setReceiptSale(result.sale);
    notify(`Bill ${result.sale.billNumber} completed.`);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            BazarPOS
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {db.settings.storeName}
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <a
            href="/bazar-pos-android.zip"
            download="bazar-pos-android.zip"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            {t(lang, 'downloadZip')}
          </a>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="md:hidden font-bold text-base text-slate-900 dark:text-slate-100 whitespace-nowrap">
              BazarPOS
            </span>
            <span className="hidden md:inline text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
              {navItems.find((n) => n.id === route)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                setDb((p) => ({ ...p, settings: { ...p.settings, language: p.settings.language === 'en' ? 'bn' : 'en' } }))
              }
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {lang === 'en' ? 'বাংলা' : 'English'}
            </button>
            <button
              type="button"
              aria-label={db.settings.darkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() =>
                setDb((p) => ({ ...p, settings: { ...p.settings, darkTheme: !p.settings.darkTheme } }))
              }
              className="rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {db.settings.darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigateTo('pos')}
              className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              POS ({cart.reduce((a, c) => a + c.quantity, 0)})
            </button>
          </div>
        </header>

        {/* Mobile Nav Strip */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2"
        >
          {navItems.map((item) => (
              <button
              key={item.id}
              type="button"
              onClick={() => navigateTo(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                route === item.id
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Toast Banner */}
        {toast && (
          <div
            role="status"
            className={`mx-4 sm:mx-6 mt-4 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              toast.isError
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200'
                : 'border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Active View */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {route === 'dashboard' && <DashboardView db={db} onNavigate={setRoute} />}
          {route === 'pos' && (
            <PosView
              db={db}
              cart={cart}
              discount={discount}
              customerName={customerName}
              customerMobile={customerMobile}
              onCustomerChange={(n, m) => {
                setCustomerName(n);
                setCustomerMobile(m);
              }}
              onAddProduct={handleAddProductToCart}
              onSetCartQty={handleSetCartQty}
              onRemoveItem={handleRemoveCartItem}
              onClearCart={handleClearCart}
              onApplyDiscount={handleApplyDiscount}
              onCompleteSale={handleCompleteSale}
              onRequireAuth={requireAuth}
              onNotify={notify}
            />
          )}
          {route === 'products' && (
            <ProductsView db={db} onUpdateDb={setDb} onRequireAuth={requireAuth} onNotify={notify} />
          )}
          {route === 'vendors' && (
            <VendorsView db={db} onUpdateDb={setDb} onRequireAuth={requireAuth} onNotify={notify} />
          )}
          {route === 'categories' && (
            <CategoriesView db={db} onUpdateDb={setDb} onRequireAuth={requireAuth} onNotify={notify} />
          )}
          {route === 'stock' && <StockView db={db} />}
          {route === 'reports' && <ReportsView db={db} />}
          {route === 'bills' && (
            <BillHistoryView
              db={db}
              onUpdateDb={setDb}
              onViewReceipt={(s) => setReceiptSale(s)}
              onRequireAuth={requireAuth}
              onNotify={notify}
            />
          )}
          {route === 'settings' && (
            <SettingsView db={db} onUpdateDb={setDb} onRequireAuth={requireAuth} onNotify={notify} />
          )}
          {route === 'android' && <AndroidProjectView />}
        </main>
      </div>

      {authState && (
        <AdminAuthModal
          action={authState.action}
          reference={authState.ref}
          onVerify={handleVerifyAuth}
          onClose={() => setAuthState(null)}
        />
      )}

      {receiptSale && (
        <ThermalReceiptModal
          sale={receiptSale}
          settings={db.settings}
          onClose={() => setReceiptSale(null)}
        />
      )}
    </div>
  );
}

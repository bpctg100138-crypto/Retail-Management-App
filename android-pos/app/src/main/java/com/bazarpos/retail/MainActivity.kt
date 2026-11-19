package com.bazarpos.retail

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bazarpos.retail.domain.BackupRestoreManager
import com.bazarpos.retail.domain.PrinterConnectionState
import com.bazarpos.retail.ui.components.AdminAuthDialog
import com.bazarpos.retail.ui.components.ReceiptPreviewDialog
import com.bazarpos.retail.ui.screens.*
import com.bazarpos.retail.ui.theme.BazarPosTheme
import com.bazarpos.retail.ui.viewmodel.MainViewModel
import kotlinx.coroutines.launch

private data class NavTab(val route: String, val labelEn: String, val labelBn: String, val icon: ImageVector)

private val NAV_TABS = listOf(
    NavTab("dashboard", "Dashboard", "ড্যাশবোর্ড", Icons.Default.Dashboard),
    NavTab("pos", "POS", "POS", Icons.Default.PointOfSale),
    NavTab("products", "Products", "পণ্য", Icons.Default.Inventory2),
    NavTab("vendors", "Vendors", "ভেন্ডর", Icons.Default.LocalShipping),
    NavTab("categories", "Categories", "ক্যাটাগরি", Icons.Default.Category),
    NavTab("stock", "Stock", "স্টক", Icons.Default.Warehouse),
    NavTab("reports", "Reports", "রিপোর্ট", Icons.Default.Assessment),
    NavTab("bills", "Bills", "বিল", Icons.Default.ReceiptLong),
    NavTab("settings", "Settings", "সেটিংস", Icons.Default.Settings)
)

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val app = application as BazarPosApplication
        if (app.barcodeProcessor.handleHardwareKeyEvent(event)) {
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val settings by viewModel.settings.collectAsState()
            val vendors by viewModel.vendors.collectAsState()
            val categories by viewModel.categories.collectAsState()
            val products by viewModel.products.collectAsState()
            val customers by viewModel.customers.collectAsState()
            val sales by viewModel.sales.collectAsState()
            val movements by viewModel.stockMovements.collectAsState()
            val exchanges by viewModel.exchanges.collectAsState()
            val auditLogs by viewModel.auditLogs.collectAsState()

            val cart by viewModel.cart.collectAsState()
            val discount by viewModel.discountAmount.collectAsState()
            val customerName by viewModel.customerName.collectAsState()
            val customerMobile by viewModel.customerMobile.collectAsState()
            val isCheckingOut by viewModel.isCheckingOut.collectAsState()
            val latestReceipt by viewModel.latestReceipt.collectAsState()
            val authPrompt by viewModel.authPrompt.collectAsState()
            val printerState by viewModel.printerManager.connectionState.collectAsState()

            val isBangla = settings.language == "bn"
            var currentRoute by remember { mutableStateOf("dashboard") }
            val snackbarHostState = remember { SnackbarHostState() }
            val scope = rememberCoroutineScope()
            val context = LocalContext.current

            var pendingCsvContent by remember { mutableStateOf<String?>(null) }
            val csvLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
                val content = pendingCsvContent
                if (uri != null && content != null) {
                    scope.launch {
                        BackupRestoreManager.exportCsvToUri(context, uri, content)
                            .onSuccess { viewModel.emitMessage("CSV exported") }
                            .onFailure { viewModel.emitMessage(it.message ?: "CSV export failed") }
                    }
                }
                pendingCsvContent = null
            }

            LaunchedEffect(Unit) {
                viewModel.snackbarMessage.collect { msg ->
                    snackbarHostState.showSnackbar(msg)
                }
            }

            BazarPosTheme(darkTheme = settings.darkTheme) {
                if (settings.adminPasswordHash.isBlank()) {
                    AdminSetupScreen(
                        isBangla = isBangla,
                        onCreatePassword = { viewModel.createInitialAdminPassword(it) }
                    )
                } else {
                    Scaffold(
                        snackbarHost = { SnackbarHost(snackbarHostState) },
                        topBar = {
                            TopAppBar(
                                title = { Text(settings.storeName) },
                                actions = {
                                    TextButton(onClick = {
                                        viewModel.updateSettings {
                                            it.copy(language = if (it.language == "en") "bn" else "en")
                                        }
                                    }) {
                                        Text(if (isBangla) "EN" else "বাংলা")
                                    }
                                    val printerLabel = when (printerState) {
                                        is PrinterConnectionState.Connected -> "BT Ready"
                                        is PrinterConnectionState.Connecting -> "BT..."
                                        else -> "No BT"
                                    }
                                    TextButton(onClick = { currentRoute = "settings" }) {
                                        Text(printerLabel)
                                    }
                                }
                            )
                        },
                        bottomBar = {
                            Surface(tonalElevation = 3.dp) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState())
                                        .padding(horizontal = 6.dp, vertical = 4.dp),
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    NAV_TABS.forEach { tab ->
                                        val selected = currentRoute == tab.route
                                        NavigationBarItem(
                                            selected = selected,
                                            onClick = { currentRoute = tab.route },
                                            icon = { Icon(tab.icon, contentDescription = tab.labelEn) },
                                            label = { Text(if (isBangla) tab.labelBn else tab.labelEn, maxLines = 1) }
                                        )
                                    }
                                }
                            }
                        }
                    ) { innerPadding ->
                        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                            when (currentRoute) {
                                "dashboard" -> DashboardScreen(
                                    sales = sales,
                                    products = products,
                                    customerCount = customers.size,
                                    currencySymbol = settings.currencySymbol,
                                    isBangla = isBangla,
                                    onNavigate = { currentRoute = it }
                                )
                                "pos" -> PosScreen(
                                    products = products,
                                    cart = cart,
                                    discountAmount = discount,
                                    customerName = customerName,
                                    customerMobile = customerMobile,
                                    currencySymbol = settings.currencySymbol,
                                    isCheckingOut = isCheckingOut,
                                    isBangla = isBangla,
                                    onScanCode = { viewModel.barcodeProcessor.submitManualScan(it) },
                                    onCameraBarcode = { viewModel.barcodeProcessor.submitCameraScan(it) },
                                    onAddProduct = { viewModel.addProductToCart(it) },
                                    onUpdateQty = { id, qty -> viewModel.updateCartQuantity(id, qty) },
                                    onRemoveItem = { viewModel.removeFromCart(it) },
                                    onClearCart = { viewModel.clearCartProtected() },
                                    onApplyDiscount = { viewModel.applyDiscountProtected(it) },
                                    onCustomerChange = { n, m -> viewModel.setCustomerInfo(n, m) },
                                    onCompleteSale = { viewModel.completeSale() }
                                )
                                "products" -> ProductsScreen(
                                    products = products,
                                    vendors = vendors,
                                    categories = categories,
                                    currencySymbol = settings.currencySymbol,
                                    onSaveProduct = { p, edit, done -> viewModel.saveProduct(p, edit, done) },
                                    onAdjustStock = { id, delta, note -> viewModel.adjustStockProtected(id, delta, note) }
                                )
                                "vendors" -> VendorsScreen(
                                    vendors = vendors,
                                    products = products,
                                    onSaveVendor = { v, edit -> viewModel.saveVendor(v, edit) },
                                    onDeleteVendor = { viewModel.deleteVendorProtected(it) }
                                )
                                "categories" -> CategoriesScreen(
                                    categories = categories,
                                    products = products,
                                    onSaveCategory = { n, d, ex -> viewModel.saveCategory(n, d, ex) },
                                    onDeleteCategory = { viewModel.deleteCategoryProtected(it) },
                                    onSaveSubcategory = { cid, n -> viewModel.saveSubcategory(cid, n) }
                                )
                                "stock" -> StockScreen(
                                    products = products,
                                    movements = movements,
                                    currencySymbol = settings.currencySymbol
                                )
                                "reports" -> ReportsScreen(
                                    sales = sales,
                                    products = products,
                                    vendors = vendors,
                                    categories = categories,
                                    customers = customers,
                                    currencySymbol = settings.currencySymbol,
                                    onExportCsv = { filename, content ->
                                        pendingCsvContent = content
                                        csvLauncher.launch(filename)
                                    }
                                )
                                "bills" -> BillHistoryScreen(
                                    sales = sales,
                                    exchanges = exchanges,
                                    products = products,
                                    currencySymbol = settings.currencySymbol,
                                    onViewReceipt = { viewModel.showReceipt(it) },
                                    onProcessExchange = { sid, ret, rep, reason, done ->
                                        viewModel.processExchangeProtected(sid, ret, rep, reason, done)
                                    }
                                )
                                "settings" -> SettingsScreen(
                                    settings = settings,
                                    auditLogs = auditLogs,
                                    printerManager = viewModel.printerManager,
                                    onUpdateSettings = { viewModel.updateSettings(it) },
                                    onChangePassword = { o, n -> viewModel.changeAdminPassword(o, n) },
                                    onNotify = { viewModel.emitMessage(it) }
                                )
                            }
                        }
                    }

                    authPrompt?.let { prompt ->
                        AdminAuthDialog(
                            prompt = prompt,
                            onVerify = { viewModel.submitAuthorizationPassword(it) },
                            onDismiss = { viewModel.dismissAuthorizationPrompt() }
                        )
                    }

                    latestReceipt?.let { receipt ->
                        ReceiptPreviewDialog(
                            saleWithItems = receipt,
                            settings = settings,
                            printerManager = viewModel.printerManager,
                            onResultMessage = { viewModel.emitMessage(it) },
                            onDismiss = { viewModel.dismissReceipt() }
                        )
                    }
                }
            }
        }
    }
}

package com.bazarpos.retail.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bazarpos.retail.data.local.entity.*
import com.bazarpos.retail.data.repository.ExchangeLineInput
import com.bazarpos.retail.domain.*
import com.bazarpos.retail.ui.components.MetricCard
import kotlinx.coroutines.launch

@Composable
fun ReportsScreen(
    sales: List<SaleWithItems>,
    products: List<ProductEntity>,
    vendors: List<VendorEntity>,
    categories: List<CategoryWithSubcategories>,
    customers: List<CustomerEntity>,
    currencySymbol: String,
    onExportCsv: (String, String) -> Unit
) {
    var range by remember { mutableStateOf("DAILY") } // DAILY, MONTHLY, YEARLY, ALL
    var customerSearch by remember { mutableStateOf("") }

    val now = System.currentTimeMillis()
    val fromMillis = when (range) {
        "DAILY" -> DhakaTime.startOfTodayMillis(now)
        "MONTHLY" -> DhakaTime.startOfMonthMillis(now)
        "YEARLY" -> DhakaTime.startOfYearMillis(now)
        else -> 0L
    }

    val filteredSales = remember(sales, fromMillis) {
        sales.filter { it.sale.createdAt >= fromMillis && it.sale.status != "CANCELLED" }
    }
    val totalSalesAmt = filteredSales.sumOf { it.sale.grandTotal }
    val totalBills = filteredSales.size
    val totalItemsSold = filteredSales.sumOf { it.sale.totalQuantity }
    val avgBill = if (totalBills > 0) totalSalesAmt / totalBills else 0.0
    val avgBasket = if (totalBills > 0) totalItemsSold / totalBills else 0.0
    val totalProfit = filteredSales.sumOf { sw ->
        sw.items.sumOf { (it.unitPrice - it.purchasePriceAtSale) * it.quantity } - sw.sale.discountAmount
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Reports & Analytics", style = MaterialTheme.typography.headlineSmall)
            OutlinedButton(onClick = {
                onExportCsv("bazarpos_sales_report.csv", BackupRestoreManager.buildSalesCsv(filteredSales))
            }) { Text("Export CSV") }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("DAILY" to "Today", "MONTHLY" to "Month", "YEARLY" to "Year", "ALL" to "All").forEach { (key, label) ->
                FilterChip(selected = range == key, onClick = { range = key }, label = { Text(label) })
            }
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Sales Amount", CurrencyFormatter.format(totalSalesAmt, currencySymbol), Modifier.weight(1f))
            MetricCard("Estimated Profit", CurrencyFormatter.format(totalProfit, currencySymbol), Modifier.weight(1f))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetricCard("Bills / Items", "$totalBills / ${totalItemsSold.toInt()}", Modifier.weight(1f))
            MetricCard("Avg Bill / Basket", "${CurrencyFormatter.format(avgBill, currencySymbol)} / ${String.format(java.util.Locale.US, "%.1f", avgBasket)}", Modifier.weight(1f))
        }

        Text("Category Contribution", style = MaterialTheme.typography.titleMedium)
        val productMap = remember(products) { products.associateBy { it.id } }
        categories.forEach { cw ->
            val catItems = filteredSales.flatMap { it.items }.filter { productMap[it.productId]?.categoryId == cw.category.id }
            val catAmt = catItems.sumOf { it.subtotal }
            val pct = if (totalSalesAmt > 0) GpCalculator.round2((catAmt / totalSalesAmt) * 100.0) else 0.0
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(cw.category.name)
                Text("${CurrencyFormatter.format(catAmt, currencySymbol)} ($pct%)")
            }
        }

        Text("Vendor Summary", style = MaterialTheme.typography.titleMedium)
        vendors.forEach { v ->
            val vProds = products.filter { it.vendorId == v.id }
            val vStock = vProds.sumOf { it.currentStock }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${v.name} (${vProds.size} products)")
                Text("Stock: ${vStock.toInt()}")
            }
        }

        Text("Customer Search (by mobile)", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(value = customerSearch, onValueChange = { customerSearch = it }, label = { Text("Mobile number") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        customers.filter { customerSearch.isBlank() || it.mobile.contains(customerSearch) }.take(10).forEach { c ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${c.name} (${c.mobile})")
                    Text("${c.billCount} bills · ${CurrencyFormatter.format(c.totalSpent, currencySymbol)}")
                }
            }
        }
    }
}

@Composable
fun BillHistoryScreen(
    sales: List<SaleWithItems>,
    exchanges: List<ExchangeWithItems>,
    products: List<ProductEntity>,
    currencySymbol: String,
    onViewReceipt: (SaleWithItems) -> Unit,
    onProcessExchange: (Long, List<ExchangeLineInput>, List<ExchangeLineInput>, String, () -> Unit) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var exchangeTarget by remember { mutableStateOf<SaleWithItems?>(null) }

    val filtered = remember(sales, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) sales
        else sales.filter {
            it.sale.billNumber.lowercase().contains(q) ||
                it.sale.customerName.lowercase().contains(q) ||
                it.sale.customerMobile.contains(q)
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Bill History & Exchanges", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search bill number, customer, mobile") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.sale.id }) { sw ->
                val eligible = ExchangePolicy.isEligibleForExchange(sw.sale.createdAt)
                OutlinedCard {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${sw.sale.billNumber} · ${sw.sale.status}", fontWeight = FontWeight.Bold)
                            Text(CurrencyFormatter.format(sw.sale.grandTotal, currencySymbol), fontWeight = FontWeight.Bold)
                        }
                        Text("${DhakaTime.formatDateTime(sw.sale.createdAt)} · ${sw.items.size} items", style = MaterialTheme.typography.labelSmall)
                        if (sw.sale.customerName.isNotBlank() || sw.sale.customerMobile.isNotBlank()) {
                            Text("Customer: ${sw.sale.customerName} ${sw.sale.customerMobile}", style = MaterialTheme.typography.labelSmall)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { onViewReceipt(sw) }) { Text("Reprint") }
                            if (eligible && sw.sale.status != "CANCELLED") {
                                Button(onClick = { exchangeTarget = sw }) { Text("Exchange (3-Day)") }
                            }
                        }
                    }
                }
            }
            if (exchanges.isNotEmpty()) {
                item {
                    Text("Exchange History (${exchanges.size})", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                }
                items(exchanges, key = { it.exchange.id }) { ew ->
                    OutlinedCard {
                        Column(Modifier.fillMaxWidth().padding(10.dp)) {
                            Text("${ew.exchange.exchangeNumber} (Bill ${ew.exchange.originalBillNumber})", fontWeight = FontWeight.SemiBold)
                            Text("Returned: ${CurrencyFormatter.format(ew.exchange.returnedTotal, currencySymbol)} · Replacement: ${CurrencyFormatter.format(ew.exchange.replacementTotal, currencySymbol)}")
                        }
                    }
                }
            }
        }
    }

    exchangeTarget?.let { saleWithItems ->
        var selectedReturnId by remember { mutableStateOf(saleWithItems.items.firstOrNull()?.productId ?: 0L) }
        var selectedReplacementId by remember { mutableStateOf(products.firstOrNull()?.id ?: 0L) }
        var reason by remember { mutableStateOf("Size/item exchange within 3 days") }

        AlertDialog(
            onDismissRequest = { exchangeTarget = null },
            title = { Text("3-Day Exchange · ${saleWithItems.sale.billNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("No cash refund is available. Replacement value must equal or exceed returned item value.")
                    Text("Returning: ${saleWithItems.items.find { it.productId == selectedReturnId }?.productName ?: "-"}")
                    Text("Replacement: ${products.find { it.id == selectedReplacementId }?.name ?: "-"}")
                    OutlinedTextField(value = reason, onValueChange = { reason = it }, label = { Text("Exchange Reason") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    val retItem = saleWithItems.items.find { it.productId == selectedReturnId }
                    val repProd = products.find { it.id == selectedReplacementId }
                    if (retItem != null && repProd != null) {
                        onProcessExchange(
                            saleWithItems.sale.id,
                            listOf(ExchangeLineInput(retItem.productId, 1.0, retItem.unitPrice)),
                            listOf(ExchangeLineInput(repProd.id, 1.0, repProd.sellingPrice)),
                            reason
                        ) { exchangeTarget = null }
                    }
                }) { Text("Authorize Exchange") }
            },
            dismissButton = { TextButton(onClick = { exchangeTarget = null }) { Text("Cancel") } }
        )
    }
}

@Composable
fun SettingsScreen(
    settings: AppSettingsEntity,
    auditLogs: List<AuditLogEntity>,
    printerManager: EscPosPrinterManager,
    onUpdateSettings: ((AppSettingsEntity) -> AppSettingsEntity) -> Unit,
    onChangePassword: (String, String) -> Boolean,
    onNotify: (String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val printerState by printerManager.connectionState.collectAsState()
    val pairedPrinters = remember { printerManager.getPairedPrinters() }

    var storeName by remember(settings.storeName) { mutableStateOf(settings.storeName) }
    var storeAddress by remember(settings.storeAddress) { mutableStateOf(settings.storeAddress) }
    var storePhone by remember(settings.storePhone) { mutableStateOf(settings.storePhone) }

    val createBackupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        if (uri != null) {
            scope.launch {
                BackupRestoreManager.exportDatabaseToUri(context, uri)
                    .onSuccess { onNotify("Database backup saved") }
                    .onFailure { onNotify(it.message ?: "Backup failed") }
            }
        }
    }

    val restoreBackupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                BackupRestoreManager.restoreDatabaseFromUri(context, uri)
                    .onSuccess { onNotify("Database restored! Restart app if needed.") }
                    .onFailure { onNotify(it.message ?: "Restore failed") }
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Settings & Offline Backup", style = MaterialTheme.typography.headlineSmall)

        OutlinedTextField(value = storeName, onValueChange = { storeName = it }, label = { Text("Store Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = storeAddress, onValueChange = { storeAddress = it }, label = { Text("Store Address") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = storePhone, onValueChange = { storePhone = it }, label = { Text("Store Phone") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            onUpdateSettings { it.copy(storeName = storeName, storeAddress = storeAddress, storePhone = storePhone) }
            onNotify("Store profile updated")
        }) { Text("Save Store Profile") }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = settings.language == "en",
                onClick = { onUpdateSettings { it.copy(language = "en") } },
                label = { Text("English") }
            )
            FilterChip(
                selected = settings.language == "bn",
                onClick = { onUpdateSettings { it.copy(language = "bn") } },
                label = { Text("বাংলা") }
            )
            FilterChip(
                selected = settings.darkTheme,
                onClick = { onUpdateSettings { it.copy(darkTheme = !it.darkTheme) } },
                label = { Text(if (settings.darkTheme) "Dark Theme" else "Light Theme") }
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = settings.paperWidthMm == 58, onClick = { onUpdateSettings { it.copy(paperWidthMm = 58) } }, label = { Text("58mm Paper") })
            FilterChip(selected = settings.paperWidthMm == 80, onClick = { onUpdateSettings { it.copy(paperWidthMm = 80) } }, label = { Text("80mm Paper") })
        }

        Text("Bluetooth ESC/POS Printer", style = MaterialTheme.typography.titleMedium)
        Text("Status: $printerState", style = MaterialTheme.typography.bodySmall)
        pairedPrinters.forEach { dev ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${dev.name} (${dev.address})")
                Button(onClick = {
                    scope.launch {
                        printerManager.connect(dev.address, dev.name)
                            .onSuccess {
                                onUpdateSettings { s -> s.copy(lastPrinterAddress = dev.address, lastPrinterName = dev.name) }
                                onNotify("Connected to ${dev.name}")
                            }
                            .onFailure { onNotify(it.message ?: "Connection failed") }
                    }
                }) { Text("Connect") }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                scope.launch {
                    printerManager.printTestPage(settings)
                        .onSuccess { onNotify("Test page printed") }
                        .onFailure { onNotify(it.message ?: "Connect a printer first") }
                }
            }) { Text("Test Print") }
            OutlinedButton(onClick = { printerManager.disconnect() }) { Text("Disconnect") }
        }

        Text("Offline SQLite Backup & Restore (SAF)", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { createBackupLauncher.launch("bazarpos_backup_${DhakaTime.todayDateKey()}.db") }) {
                Text("Backup Database")
            }
            OutlinedButton(onClick = { restoreBackupLauncher.launch(arrayOf("*/*")) }) {
                Text("Restore Backup")
            }
        }

        Text("Recent Audit Log (${auditLogs.size})", style = MaterialTheme.typography.titleMedium)
        auditLogs.take(10).forEach { log ->
            Text("${log.actionType} · ${log.targetReference} · ${log.details}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

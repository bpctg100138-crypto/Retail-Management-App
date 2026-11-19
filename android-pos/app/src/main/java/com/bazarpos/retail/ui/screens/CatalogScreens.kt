package com.bazarpos.retail.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bazarpos.retail.data.local.entity.*
import com.bazarpos.retail.domain.CurrencyFormatter
import com.bazarpos.retail.domain.DhakaTime
import com.bazarpos.retail.domain.GpCalculator
import com.bazarpos.retail.ui.components.CameraScannerDialog

@Composable
fun ProductsScreen(
    products: List<ProductEntity>,
    vendors: List<VendorEntity>,
    categories: List<CategoryWithSubcategories>,
    currencySymbol: String,
    onSaveProduct: (ProductEntity, Boolean, () -> Unit) -> Unit,
    onAdjustStock: (Long, Double, String) -> Unit
) {
    var search by remember { mutableStateOf("") }
    var stockFilter by remember { mutableStateOf("ALL") } // ALL, LOW, OUT
    var editingProduct by remember { mutableStateOf<ProductEntity?>(null) }
    var showForm by remember { mutableStateOf(false) }
    var adjustTarget by remember { mutableStateOf<ProductEntity?>(null) }

    val filtered = remember(products, search, stockFilter) {
        val q = search.trim().lowercase()
        products.filter { p ->
            val matchesQuery = q.isEmpty() ||
                p.name.lowercase().contains(q) ||
                p.productCode.lowercase().contains(q) ||
                p.barcode.lowercase().contains(q)
            val matchesStock = when (stockFilter) {
                "LOW" -> p.currentStock > 0 && p.currentStock <= p.minStockAlert
                "OUT" -> p.currentStock <= 0
                else -> true
            }
            matchesQuery && matchesStock
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Products (${filtered.size})", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = { editingProduct = null; showForm = true }) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(4.dp))
                Text("Add Product")
            }
        }
        OutlinedTextField(
            value = search,
            onValueChange = { search = it },
            label = { Text("Search name, ID, barcode") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = stockFilter == "ALL", onClick = { stockFilter = "ALL" }, label = { Text("All") })
            FilterChip(selected = stockFilter == "LOW", onClick = { stockFilter = "LOW" }, label = { Text("Low Stock") })
            FilterChip(selected = stockFilter == "OUT", onClick = { stockFilter = "OUT" }, label = { Text("Out of Stock") })
        }

        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { p ->
                OutlinedCard {
                    Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("${p.name} (${p.productCode})", fontWeight = FontWeight.SemiBold)
                                Text("Barcode: ${p.barcode} · Unit: ${p.unit}", style = MaterialTheme.typography.labelSmall)
                            }
                            Row {
                                TextButton(onClick = { adjustTarget = p }) { Text("Stock") }
                                IconButton(onClick = { editingProduct = p; showForm = true }) {
                                    Icon(Icons.Default.Edit, contentDescription = "Edit product")
                                }
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Buy: ${CurrencyFormatter.format(p.purchasePrice, currencySymbol)} | Sell: ${CurrencyFormatter.format(p.sellingPrice, currencySymbol)}")
                            Text("GP: ${CurrencyFormatter.format(p.gpAmount, currencySymbol)} (${p.gpPercentage}%)", fontWeight = FontWeight.Medium)
                        }
                        Text(
                            "Stock: ${p.currentStock} ${p.unit} (Alert <= ${p.minStockAlert})",
                            color = if (p.currentStock <= 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.labelMedium
                        )
                    }
                }
            }
        }
    }

    if (showForm) {
        ProductFormDialog(
            existing = editingProduct,
            vendors = vendors,
            categories = categories,
            onDismiss = { showForm = false },
            onSave = { entity, isEdit ->
                onSaveProduct(entity, isEdit) { showForm = false }
            }
        )
    }

    adjustTarget?.let { target ->
        var deltaText by remember { mutableStateOf("0") }
        var note by remember { mutableStateOf("Manual stock adjustment") }
        AlertDialog(
            onDismissRequest = { adjustTarget = null },
            title = { Text("Adjust Stock · ${target.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Current Stock: ${target.currentStock} ${target.unit}")
                    OutlinedTextField(
                        value = deltaText,
                        onValueChange = { deltaText = it },
                        label = { Text("Quantity Delta (+add / -deduct)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        label = { Text("Reason / Note") },
                        singleLine = true
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val delta = deltaText.toDoubleOrNull() ?: 0.0
                    if (delta != 0.0) onAdjustStock(target.id, delta, note)
                    adjustTarget = null
                }) { Text("Authorize & Update") }
            },
            dismissButton = { TextButton(onClick = { adjustTarget = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun ProductFormDialog(
    existing: ProductEntity?,
    vendors: List<VendorEntity>,
    categories: List<CategoryWithSubcategories>,
    onDismiss: () -> Unit,
    onSave: (ProductEntity, Boolean) -> Unit
) {
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var barcode by remember { mutableStateOf(existing?.barcode ?: "") }
    var description by remember { mutableStateOf(existing?.description ?: "") }
    var purchaseText by remember { mutableStateOf(existing?.purchasePrice?.toString() ?: "") }
    var sellingText by remember { mutableStateOf(existing?.sellingPrice?.toString() ?: "") }
    var stockText by remember { mutableStateOf(existing?.currentStock?.toString() ?: "0") }
    var minAlertText by remember { mutableStateOf(existing?.minStockAlert?.toString() ?: "5") }
    var unit by remember { mutableStateOf(existing?.unit ?: "piece") }
    var selectedVendorId by remember { mutableStateOf(existing?.vendorId ?: vendors.firstOrNull()?.id ?: 0L) }
    var selectedCatId by remember { mutableStateOf(existing?.categoryId ?: categories.firstOrNull()?.category?.id ?: 0L) }
    var selectedSubId by remember { mutableStateOf(existing?.subcategoryId) }
    var showScanner by remember { mutableStateOf(false) }

    val purchase = purchaseText.toDoubleOrNull() ?: 0.0
    val selling = sellingText.toDoubleOrNull() ?: 0.0
    val gp = GpCalculator.calculate(purchase, selling)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "Register Product" else "Edit Product") },
        text = {
            Column(
                modifier = Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name*") }, singleLine = true)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(
                        value = barcode,
                        onValueChange = { barcode = it },
                        label = { Text("Barcode*") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(onClick = { showScanner = true }) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan barcode")
                    }
                }
                OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = purchaseText,
                        onValueChange = { purchaseText = it },
                        label = { Text("Purchase ৳") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = sellingText,
                        onValueChange = { sellingText = it },
                        label = { Text("Selling MRP ৳") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                }
                Text("Live GP: ৳${gp.gpAmount} (${gp.gpPercentage}%)", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = stockText,
                        onValueChange = { stockText = it },
                        label = { Text("Current Stock") },
                        enabled = existing == null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = minAlertText,
                        onValueChange = { minAlertText = it },
                        label = { Text("Min Alert") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f)
                    )
                }
                OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit (piece, packet, kg, litre)") }, singleLine = true)
                if (vendors.isEmpty() || categories.isEmpty()) {
                    Text("Create at least one Vendor and Category before saving.", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                enabled = name.isNotBlank() && barcode.isNotBlank() && selectedVendorId > 0 && selectedCatId > 0,
                onClick = {
                    val entity = ProductEntity(
                        id = existing?.id ?: 0L,
                        productCode = existing?.productCode ?: "",
                        vendorId = selectedVendorId,
                        categoryId = selectedCatId,
                        subcategoryId = selectedSubId,
                        barcode = barcode.trim(),
                        name = name.trim(),
                        description = description.trim(),
                        purchasePrice = purchase,
                        sellingPrice = selling,
                        gpAmount = gp.gpAmount,
                        gpPercentage = gp.gpPercentage,
                        currentStock = existing?.currentStock ?: (stockText.toDoubleOrNull() ?: 0.0),
                        minStockAlert = minAlertText.toDoubleOrNull() ?: 5.0,
                        unit = unit.ifBlank { "piece" },
                        createdAt = existing?.createdAt ?: System.currentTimeMillis()
                    )
                    onSave(entity, existing != null)
                }
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )

    if (showScanner) {
        CameraScannerDialog(
            onBarcodeDetected = { barcode = it },
            onDismiss = { showScanner = false }
        )
    }
}

@Composable
fun VendorsScreen(
    vendors: List<VendorEntity>,
    products: List<ProductEntity>,
    onSaveVendor: (VendorEntity, Boolean) -> Unit,
    onDeleteVendor: (VendorEntity) -> Unit
) {
    var search by remember { mutableStateOf("") }
    var showForm by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<VendorEntity?>(null) }

    val filtered = remember(vendors, search) {
        val q = search.trim().lowercase()
        if (q.isEmpty()) vendors
        else vendors.filter { it.name.lowercase().contains(q) || it.vendorCode.lowercase().contains(q) || it.mobile.contains(q) }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Vendors (${filtered.size})", style = MaterialTheme.typography.headlineSmall)
            Button(onClick = { editing = null; showForm = true }) { Text("Add Vendor") }
        }
        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Search vendor name, ID, mobile") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { v ->
                val count = products.count { it.vendorId == v.id }
                OutlinedCard {
                    Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${v.name} (${v.vendorCode})", fontWeight = FontWeight.SemiBold)
                            Text("Contact: ${v.contactPerson} · ${v.mobile}", style = MaterialTheme.typography.labelMedium)
                            Text("Products linked: $count · ${v.address}", style = MaterialTheme.typography.labelSmall)
                        }
                        Row {
                            IconButton(onClick = { editing = v; showForm = true }) { Icon(Icons.Default.Edit, contentDescription = "Edit vendor") }
                            IconButton(onClick = { onDeleteVendor(v) }) { Icon(Icons.Default.Delete, contentDescription = "Delete vendor", tint = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }

    if (showForm) {
        var name by remember { mutableStateOf(editing?.name ?: "") }
        var contact by remember { mutableStateOf(editing?.contactPerson ?: "") }
        var mobile by remember { mutableStateOf(editing?.mobile ?: "") }
        var altPhone by remember { mutableStateOf(editing?.altPhone ?: "") }
        var address by remember { mutableStateOf(editing?.address ?: "") }
        var notes by remember { mutableStateOf(editing?.notes ?: "") }
        AlertDialog(
            onDismissRequest = { showForm = false },
            title = { Text(if (editing == null) "Add Vendor" else "Edit Vendor") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Vendor Name*") }, singleLine = true)
                    OutlinedTextField(value = contact, onValueChange = { contact = it }, label = { Text("Contact Person*") }, singleLine = true)
                    OutlinedTextField(value = mobile, onValueChange = { mobile = it }, label = { Text("Mobile*") }, singleLine = true)
                    OutlinedTextField(value = altPhone, onValueChange = { altPhone = it }, label = { Text("Alt Phone") }, singleLine = true)
                    OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text("Address") })
                    OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes") })
                }
            },
            confirmButton = {
                Button(enabled = name.isNotBlank() && mobile.isNotBlank(), onClick = {
                    onSaveVendor(
                        VendorEntity(
                            id = editing?.id ?: 0L,
                            vendorCode = editing?.vendorCode ?: "",
                            name = name.trim(),
                            contactPerson = contact.trim(),
                            mobile = mobile.trim(),
                            altPhone = altPhone.trim(),
                            address = address.trim(),
                            notes = notes.trim()
                        ),
                        editing != null
                    )
                    showForm = false
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showForm = false }) { Text("Cancel") } }
        )
    }
}

@Composable
fun CategoriesScreen(
    categories: List<CategoryWithSubcategories>,
    products: List<ProductEntity>,
    onSaveCategory: (String, String, CategoryEntity?) -> Unit,
    onDeleteCategory: (CategoryEntity) -> Unit,
    onSaveSubcategory: (Long, String) -> Unit
) {
    var newCatName by remember { mutableStateOf("") }
    var newCatDesc by remember { mutableStateOf("") }
    var subTargetCatId by remember { mutableStateOf<Long?>(null) }
    var subName by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Categories & Subcategories", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = newCatName, onValueChange = { newCatName = it }, label = { Text("New Category") }, singleLine = true, modifier = Modifier.weight(1f))
            Button(enabled = newCatName.isNotBlank(), onClick = {
                onSaveCategory(newCatName, newCatDesc, null)
                newCatName = ""
                newCatDesc = ""
            }) { Text("Create") }
        }

        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(categories, key = { it.category.id }) { cw ->
                val cat = cw.category
                val prodCount = products.count { it.categoryId == cat.id }
                OutlinedCard {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text("${cat.name} (${cat.categoryCode})", fontWeight = FontWeight.SemiBold)
                                Text("Products: $prodCount · Subcategories: ${cw.subcategories.size}", style = MaterialTheme.typography.labelSmall)
                            }
                            Row {
                                TextButton(onClick = { subTargetCatId = cat.id; subName = "" }) { Text("+ Sub") }
                                IconButton(onClick = { onDeleteCategory(cat) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete category", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                        if (cw.subcategories.isNotEmpty()) {
                            Text(
                                cw.subcategories.joinToString(" · ") { "${it.name} (${it.subcategoryCode})" },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }

    subTargetCatId?.let { catId ->
        AlertDialog(
            onDismissRequest = { subTargetCatId = null },
            title = { Text("Add Subcategory") },
            text = { OutlinedTextField(value = subName, onValueChange = { subName = it }, label = { Text("Subcategory Name") }, singleLine = true) },
            confirmButton = {
                Button(enabled = subName.isNotBlank(), onClick = {
                    onSaveSubcategory(catId, subName)
                    subTargetCatId = null
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { subTargetCatId = null }) { Text("Cancel") } }
        )
    }
}

@Composable
fun StockScreen(
    products: List<ProductEntity>,
    movements: List<StockMovementEntity>,
    currencySymbol: String
) {
    val totalValuation = products.sumOf { it.currentStock * it.purchasePrice }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Stock & Movement History", style = MaterialTheme.typography.headlineSmall)
        OutlinedCard(modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Total Valuation (Cost):", fontWeight = FontWeight.Medium)
                Text(CurrencyFormatter.format(totalValuation, currencySymbol), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
        }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(movements, key = { it.id }) { m ->
                OutlinedCard {
                    Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text("${m.productName} · ${m.movementType}", fontWeight = FontWeight.Medium)
                            Text("${DhakaTime.formatDateTime(m.createdAt)} ${if (m.referenceBillId.isNotBlank()) "· ${m.referenceBillId}" else ""}", style = MaterialTheme.typography.labelSmall)
                        }
                        Text("${if (m.quantity >= 0) "+" else ""}${m.quantity.toInt()} (${m.previousStock.toInt()}→${m.newStock.toInt()})", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

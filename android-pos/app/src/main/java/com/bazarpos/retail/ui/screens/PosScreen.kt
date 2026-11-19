package com.bazarpos.retail.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.bazarpos.retail.data.local.entity.ProductEntity
import com.bazarpos.retail.domain.CurrencyFormatter
import com.bazarpos.retail.domain.GpCalculator
import com.bazarpos.retail.ui.components.CameraScannerDialog
import com.bazarpos.retail.ui.viewmodel.CartItemUi

@Composable
fun PosScreen(
    products: List<ProductEntity>,
    cart: List<CartItemUi>,
    discountAmount: Double,
    customerName: String,
    customerMobile: String,
    currencySymbol: String,
    isCheckingOut: Boolean,
    isBangla: Boolean,
    onScanCode: (String) -> Unit,
    onCameraBarcode: (String) -> Unit,
    onAddProduct: (ProductEntity) -> Unit,
    onUpdateQty: (Long, Double) -> Unit,
    onRemoveItem: (Long) -> Unit,
    onClearCart: () -> Unit,
    onApplyDiscount: (Double) -> Unit,
    onCustomerChange: (String, String) -> Unit,
    onCompleteSale: () -> Unit
) {
    var barcodeQuery by remember { mutableStateOf("") }
    var showCameraScanner by remember { mutableStateOf(false) }
    var showDiscountDialog by remember { mutableStateOf(false) }

    val subtotal = cart.sumOf { it.subtotal }
    val totalQty = cart.sumOf { it.quantity }
    val grandTotal = GpCalculator.round2((subtotal - discountAmount).coerceAtLeast(0.0))

    val filteredCatalog = remember(products, barcodeQuery) {
        val q = barcodeQuery.trim().lowercase()
        if (q.isEmpty()) products.take(8)
        else products.filter {
            it.name.lowercase().contains(q) ||
                it.barcode.lowercase().contains(q) ||
                it.productCode.lowercase().contains(q)
        }.take(12)
    }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Unified Barcode Scan / Search Bar (Camera + USB OTG HID + BT HID + Manual)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = barcodeQuery,
                onValueChange = { barcodeQuery = it },
                label = { Text(if (isBangla) "বারকোড স্ক্যান বা পণ্য খুঁজুন" else "Scan Barcode or Search Product") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = {
                    if (barcodeQuery.isNotBlank()) {
                        onScanCode(barcodeQuery.trim())
                        barcodeQuery = ""
                    }
                }),
                modifier = Modifier.weight(1f)
            )
            FilledTonalIconButton(
                onClick = { showCameraScanner = true },
                modifier = Modifier.size(56.dp)
            ) {
                Icon(Icons.Default.QrCodeScanner, contentDescription = "Camera Scanner")
            }
        }

        // Quick pick product strip
        if (filteredCatalog.isNotEmpty()) {
            LazyColumn(modifier = Modifier.heightIn(max = 140.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(filteredCatalog, key = { it.id }) { p ->
                    OutlinedCard(onClick = { onAddProduct(p) }) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(p.name, fontWeight = FontWeight.Medium)
                                Text(
                                    "${p.barcode} · Stock: ${p.currentStock} ${p.unit}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                CurrencyFormatter.format(p.sellingPrice, currencySymbol),
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }

        // Cart Items
        Text(
            if (isBangla) "বর্তমান বিল (${cart.size} আইটেম)" else "Active Cart (${cart.size} items)",
            style = MaterialTheme.typography.titleMedium
        )
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(cart, key = { it.product.id }) { item ->
                OutlinedCard {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.product.name, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${CurrencyFormatter.format(item.unitPrice, currencySymbol)} · Stock: ${item.product.currentStock}",
                                style = MaterialTheme.typography.labelSmall
                            )
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { onUpdateQty(item.product.id, item.quantity - 1.0) }) {
                                Icon(Icons.Default.Remove, contentDescription = "Decrease quantity")
                            }
                            Text("${item.quantity.toInt()}", fontWeight = FontWeight.Bold)
                            IconButton(onClick = { onUpdateQty(item.product.id, item.quantity + 1.0) }) {
                                Icon(Icons.Default.Add, contentDescription = "Increase quantity")
                            }
                            Text(
                                CurrencyFormatter.format(item.subtotal, currencySymbol),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp)
                            )
                            IconButton(onClick = { onRemoveItem(item.product.id) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Remove item", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }
        }

        // Optional Customer Info + Totals + Checkout
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = customerName,
                onValueChange = { onCustomerChange(it, customerMobile) },
                label = { Text(if (isBangla) "গ্রাহকের নাম" else "Customer Name") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = customerMobile,
                onValueChange = { onCustomerChange(customerName, it) },
                label = { Text(if (isBangla) "মোবাইল" else "Mobile") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
        }

        OutlinedCard {
            Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Total Qty: ${totalQty.toInt()}")
                    Text("Subtotal: ${CurrencyFormatter.format(subtotal, currencySymbol)}")
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { showDiscountDialog = true }, contentPadding = PaddingValues(0.dp)) {
                        Text("Discount: -${CurrencyFormatter.format(discountAmount, currencySymbol)}")
                    }
                    Text(
                        "Grand Total: ${CurrencyFormatter.format(grandTotal, currencySymbol)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onClearCart, enabled = cart.isNotEmpty(), modifier = Modifier.weight(0.35f).height(50.dp)) {
                        Text(if (isBangla) "বাতিল" else "Clear")
                    }
                    Button(
                        onClick = onCompleteSale,
                        enabled = cart.isNotEmpty() && !isCheckingOut,
                        modifier = Modifier.weight(0.65f).height(50.dp)
                    ) {
                        Text(if (isCheckingOut) "Processing..." else if (isBangla) "বিক্রয় সম্পন্ন করুন" else "Complete Sale")
                    }
                }
            }
        }
    }

    if (showCameraScanner) {
        CameraScannerDialog(
            onBarcodeDetected = onCameraBarcode,
            onDismiss = { showCameraScanner = false }
        )
    }

    if (showDiscountDialog) {
        var input by remember { mutableStateOf(discountAmount.toString()) }
        AlertDialog(
            onDismissRequest = { showDiscountDialog = false },
            title = { Text("Apply Bill Discount") },
            text = {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("Discount Amount ($currencySymbol)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true
                )
            },
            confirmButton = {
                Button(onClick = {
                    val value = input.toDoubleOrNull() ?: 0.0
                    showDiscountDialog = false
                    onApplyDiscount(value)
                }) { Text("Authorize & Apply") }
            },
            dismissButton = {
                TextButton(onClick = { showDiscountDialog = false }) { Text("Cancel") }
            }
        )
    }
}

package com.bazarpos.retail.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.bazarpos.retail.data.local.entity.ProductEntity
import com.bazarpos.retail.data.local.entity.SaleWithItems
import com.bazarpos.retail.domain.CurrencyFormatter
import com.bazarpos.retail.domain.DhakaTime
import com.bazarpos.retail.ui.components.MetricCard

@Composable
fun AdminSetupScreen(
    isBangla: Boolean,
    onCreatePassword: (String) -> Unit
) {
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        OutlinedCard(modifier = Modifier.fillMaxWidth().widthIn(max = 440.dp)) {
            Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(
                    if (isBangla) "অ্যাডমিনিস্ট্রেটর পাসওয়ার্ড তৈরি করুন" else "Create Administrator Password",
                    style = MaterialTheme.typography.headlineSmall
                )
                Text(
                    if (isBangla) "প্রথমবার ব্যবহারের জন্য নিরাপদ পাসওয়ার্ড সেট করুন।"
                    else "First-launch security setup: protect POS removals, discounts, stock edits, and exchanges.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; error = null },
                    label = { Text(if (isBangla) "নতুন পাসওয়ার্ড (সর্বনিম্ন ৪ অক্ষর)" else "New Password (min 4 chars)") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it; error = null },
                    label = { Text(if (isBangla) "পাসওয়ার্ড নিশ্চিত করুন" else "Confirm Password") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (error != null) {
                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                }
                Button(
                    onClick = {
                        when {
                            password.length < 4 -> error = "Password must be at least 4 characters"
                            password != confirm -> error = "Passwords do not match"
                            else -> onCreatePassword(password)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Text(if (isBangla) "পাসওয়ার্ড সংরক্ষণ ও শুরু করুন" else "Save Password & Launch POS")
                }
            }
        }
    }
}

@Composable
fun DashboardScreen(
    sales: List<SaleWithItems>,
    products: List<ProductEntity>,
    customerCount: Int,
    currencySymbol: String,
    isBangla: Boolean,
    onNavigate: (String) -> Unit
) {
    val todayKey = remember { DhakaTime.todayDateKey() }
    val todaySales = remember(sales, todayKey) {
        sales.filter { it.sale.billDateKey == todayKey && it.sale.status != "CANCELLED" }
    }
    val todayRevenue = todaySales.sumOf { it.sale.grandTotal }
    val totalBills = todaySales.size
    val totalItemsSold = todaySales.sumOf { it.sale.totalQuantity }
    val avgBillValue = if (totalBills > 0) todayRevenue / totalBills else 0.0
    val avgBasketSize = if (totalBills > 0) totalItemsSold / totalBills else 0.0

    val totalStockQty = products.sumOf { it.currentStock }
    val lowStockCount = products.count { it.currentStock > 0.0 && it.currentStock <= it.minStockAlert }
    val outOfStockCount = products.count { it.currentStock <= 0.0 }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            if (isBangla) "দোকানের সারসংক্ষেপ (${todayKey})" else "Retail Overview ($todayKey · Asia/Dhaka)",
            style = MaterialTheme.typography.headlineSmall
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(
                label = if (isBangla) "আজকের বিক্রয়" else "Today's Sales",
                value = CurrencyFormatter.format(todayRevenue, currencySymbol),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = if (isBangla) "মোট বিল" else "Total Bills",
                value = totalBills.toString(),
                modifier = Modifier.weight(1f)
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(
                label = if (isBangla) "গড় বিল মূল্য" else "Avg Bill Value",
                value = CurrencyFormatter.format(avgBillValue, currencySymbol),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = if (isBangla) "গড় বাস্কেট সাইজ" else "Avg Basket Size",
                value = String.format(java.util.Locale.US, "%.2f", avgBasketSize),
                modifier = Modifier.weight(1f)
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(
                label = if (isBangla) "মোট পণ্য / স্টক" else "Products / Stock",
                value = "${products.size} / ${totalStockQty.toInt()}",
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = if (isBangla) "গ্রাহক সংখ্যা" else "Total Customers",
                value = customerCount.toString(),
                modifier = Modifier.weight(1f)
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard(
                label = if (isBangla) "লো স্টক সতর্কতা" else "Low Stock",
                value = lowStockCount.toString(),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = if (isBangla) "স্টক শেষ" else "Out of Stock",
                value = outOfStockCount.toString(),
                modifier = Modifier.weight(1f)
            )
        }

        Text(if (isBangla) "দ্রুত অ্যাক্সেস" else "Quick Access", style = MaterialTheme.typography.titleMedium)
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { onNavigate("pos") }, modifier = Modifier.weight(1f).height(48.dp)) {
                Text(if (isBangla) "নতুন বিল (POS)" else "Open POS")
            }
            OutlinedButton(onClick = { onNavigate("products") }, modifier = Modifier.weight(1f).height(48.dp)) {
                Text(if (isBangla) "পণ্য" else "Products")
            }
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { onNavigate("vendors") }, modifier = Modifier.weight(1f)) {
                Text(if (isBangla) "ভেন্ডর" else "Vendors")
            }
            OutlinedButton(onClick = { onNavigate("categories") }, modifier = Modifier.weight(1f)) {
                Text(if (isBangla) "ক্যাটাগরি" else "Categories")
            }
            OutlinedButton(onClick = { onNavigate("reports") }, modifier = Modifier.weight(1f)) {
                Text(if (isBangla) "রিপোর্ট" else "Reports")
            }
        }

        if (lowStockCount > 0 || outOfStockCount > 0) {
            OutlinedCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Stock Alerts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    products.filter { it.currentStock <= it.minStockAlert }.take(6).forEach { p ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(p.name, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "${p.currentStock} ${p.unit}",
                                color = if (p.currentStock <= 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}

package com.bazarpos.retail.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.bazarpos.retail.BazarPosApplication
import com.bazarpos.retail.data.local.entity.*
import com.bazarpos.retail.data.repository.CartLineInput
import com.bazarpos.retail.data.repository.ExchangeLineInput
import com.bazarpos.retail.domain.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class CartItemUi(
    val product: ProductEntity,
    val quantity: Double,
    val unitPrice: Double
) {
    val subtotal: Double get() = GpCalculator.round2(quantity * unitPrice)
}

data class AuthPromptState(
    val action: ProtectedAction,
    val reference: String = "",
    val onAuthorized: () -> Unit
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as BazarPosApplication
    val repo = app.repository
    val barcodeProcessor = app.barcodeProcessor
    val printerManager = app.printerManager

    val settings: StateFlow<AppSettingsEntity> = repo.settingsFlow
        .map { it ?: AppSettingsEntity() }
        .stateIn(viewModelScope, SharingStarted.Eagerly, AppSettingsEntity())

    val vendors = repo.vendorsFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val categories = repo.categoriesFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val products = repo.productsFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val customers = repo.customersFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val sales = repo.salesFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val stockMovements = repo.stockMovementsFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val exchanges = repo.exchangesFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val auditLogs = repo.auditLogsFlow.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    // POS Cart State
    private val _cart = MutableStateFlow<List<CartItemUi>>(emptyList())
    val cart: StateFlow<List<CartItemUi>> = _cart.asStateFlow()

    private val _discountAmount = MutableStateFlow(0.0)
    val discountAmount: StateFlow<Double> = _discountAmount.asStateFlow()

    private val _customerName = MutableStateFlow("")
    val customerName: StateFlow<String> = _customerName.asStateFlow()

    private val _customerMobile = MutableStateFlow("")
    val customerMobile: StateFlow<String> = _customerMobile.asStateFlow()

    private val _isCheckingOut = MutableStateFlow(false)
    val isCheckingOut: StateFlow<Boolean> = _isCheckingOut.asStateFlow()

    private val _latestReceipt = MutableStateFlow<SaleWithItems?>(null)
    val latestReceipt: StateFlow<SaleWithItems?> = _latestReceipt.asStateFlow()

    private val _snackbarMessage = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val snackbarMessage: SharedFlow<String> = _snackbarMessage.asSharedFlow()

    private val _authPrompt = MutableStateFlow<AuthPromptState?>(null)
    val authPrompt: StateFlow<AuthPromptState?> = _authPrompt.asStateFlow()

    init {
        viewModelScope.launch {
            barcodeProcessor.scans.collect { event ->
                handleIncomingBarcode(event)
            }
        }
        viewModelScope.launch {
            // Auto-reconnect last-used Bluetooth printer if saved
            val current = repo.getSettings()
            if (current.lastPrinterAddress.isNotBlank()) {
                printerManager.connect(current.lastPrinterAddress, current.lastPrinterName)
            }
        }
    }

    fun emitMessage(msg: String) {
        _snackbarMessage.tryEmit(msg)
    }

    fun createInitialAdminPassword(password: String) {
        viewModelScope.launch {
            val (hash, salt) = SecurityManager.createPasswordHash(password)
            val current = repo.getSettings()
            repo.saveSettings(current.copy(adminPasswordHash = hash, adminPasswordSalt = salt))
            repo.logAudit("ADMIN_PASSWORD_CREATED", "SETTINGS", "Initial administrator password configured")
        }
    }

    fun changeAdminPassword(oldPassword: String, newPassword: String): Boolean {
        val current = settings.value
        if (!SecurityManager.verifyPassword(oldPassword, current.adminPasswordHash, current.adminPasswordSalt)) {
            return false
        }
        viewModelScope.launch {
            val (hash, salt) = SecurityManager.createPasswordHash(newPassword)
            repo.saveSettings(current.copy(adminPasswordHash = hash, adminPasswordSalt = salt))
            repo.logAudit("ADMIN_PASSWORD_CHANGED", "SETTINGS", "Administrator password updated")
            emitMessage("Password updated")
        }
        return true
    }

    fun requireAuthorization(action: ProtectedAction, reference: String = "", onAuthorized: () -> Unit) {
        val s = settings.value
        val requiresPassword = when (action) {
            ProtectedAction.REMOVE_CART_ITEM, ProtectedAction.REDUCE_CART_QTY, ProtectedAction.CLEAR_CART -> s.protectPosRemoval
            ProtectedAction.APPLY_DISCOUNT -> s.protectPosDiscount
            ProtectedAction.CANCEL_BILL -> s.protectBillCancel
            ProtectedAction.PRODUCT_SENSITIVE -> s.protectProductOps
            ProtectedAction.VENDOR_SENSITIVE -> s.protectVendorOps
            ProtectedAction.CATEGORY_SENSITIVE -> s.protectCategoryOps
            ProtectedAction.STOCK_ADJUSTMENT -> s.protectStockAdjust
            ProtectedAction.SENSITIVE_REPORTS -> s.protectSensitiveReports
            ProtectedAction.OVERRIDE_STOCK, ProtectedAction.PROCESS_EXCHANGE, ProtectedAction.RESTORE_BACKUP -> true
        }
        if (!requiresPassword || s.adminPasswordHash.isBlank()) {
            onAuthorized()
        } else {
            _authPrompt.value = AuthPromptState(action = action, reference = reference, onAuthorized = onAuthorized)
        }
    }

    fun submitAuthorizationPassword(password: String): Boolean {
        val prompt = _authPrompt.value ?: return false
        val s = settings.value
        val ok = SecurityManager.verifyPassword(password, s.adminPasswordHash, s.adminPasswordSalt)
        if (ok) {
            _authPrompt.value = null
            viewModelScope.launch {
                repo.logAudit(prompt.action.name, prompt.reference, "Authorized: ${prompt.action.title}")
            }
            prompt.onAuthorized()
        }
        return ok
    }

    fun dismissAuthorizationPrompt() {
        _authPrompt.value = null
    }

    private suspend fun handleIncomingBarcode(event: BarcodeScanEvent) {
        val product = repo.findProductByBarcode(event.code)
        if (product == null) {
            emitMessage("Product not found for barcode: ${event.code}")
            return
        }
        addProductToCart(product, allowOverStock = false)
    }

    fun addProductToCart(product: ProductEntity, allowOverStock: Boolean = false) {
        val list = _cart.value.toMutableList()
        val idx = list.indexOfFirst { it.product.id == product.id }
        if (idx >= 0) {
            val currentQty = list[idx].quantity
            if (!allowOverStock && currentQty + 1.0 > product.currentStock) {
                emitMessage("Stock limit reached for ${product.name} (${product.currentStock} ${product.unit})")
                return
            }
            list[idx] = list[idx].copy(quantity = currentQty + 1.0)
        } else {
            if (!allowOverStock && product.currentStock < 1.0) {
                emitMessage("${product.name} is out of stock!")
                return
            }
            list.add(CartItemUi(product = product, quantity = 1.0, unitPrice = product.sellingPrice))
        }
        _cart.value = list
    }

    fun updateCartQuantity(productId: Long, newQty: Double) {
        val item = _cart.value.find { it.product.id == productId } ?: return
        if (newQty <= 0.0) {
            requireAuthorization(ProtectedAction.REMOVE_CART_ITEM, item.product.name) {
                _cart.value = _cart.value.filterNot { it.product.id == productId }
            }
            return
        }
        if (newQty < item.quantity) {
            requireAuthorization(ProtectedAction.REDUCE_CART_QTY, item.product.name) {
                _cart.value = _cart.value.map { if (it.product.id == productId) it.copy(quantity = newQty) else it }
            }
            return
        }
        if (newQty > item.product.currentStock) {
            requireAuthorization(ProtectedAction.OVERRIDE_STOCK, item.product.name) {
                _cart.value = _cart.value.map { if (it.product.id == productId) it.copy(quantity = newQty) else it }
            }
            return
        }
        _cart.value = _cart.value.map { if (it.product.id == productId) it.copy(quantity = newQty) else it }
    }

    fun removeFromCart(productId: Long) {
        val item = _cart.value.find { it.product.id == productId } ?: return
        requireAuthorization(ProtectedAction.REMOVE_CART_ITEM, item.product.name) {
            _cart.value = _cart.value.filterNot { it.product.id == productId }
        }
    }

    fun clearCartProtected() {
        if (_cart.value.isEmpty()) return
        requireAuthorization(ProtectedAction.CLEAR_CART, "POS_CART") {
            _cart.value = emptyList()
            _discountAmount.value = 0.0
            _customerName.value = ""
            _customerMobile.value = ""
        }
    }

    fun applyDiscountProtected(amount: Double) {
        requireAuthorization(ProtectedAction.APPLY_DISCOUNT, "Discount ৳$amount") {
            _discountAmount.value = amount.coerceAtLeast(0.0)
        }
    }

    fun setCustomerInfo(name: String, mobile: String) {
        _customerName.value = name
        _customerMobile.value = mobile
    }

    fun completeSale(allowOverStock: Boolean = false) {
        if (_isCheckingOut.value || _cart.value.isEmpty()) return
        _isCheckingOut.value = true
        viewModelScope.launch {
            val lines = _cart.value.map {
                CartLineInput(productId = it.product.id, quantity = it.quantity, unitPrice = it.unitPrice)
            }
            val result = repo.completeSale(
                lines = lines,
                discountAmount = _discountAmount.value,
                customerName = _customerName.value,
                customerMobile = _customerMobile.value,
                allowOverStockOverride = allowOverStock
            )
            result.onSuccess { saleWithItems ->
                _cart.value = emptyList()
                _discountAmount.value = 0.0
                _customerName.value = ""
                _customerMobile.value = ""
                _latestReceipt.value = saleWithItems
                emitMessage("Bill ${saleWithItems.sale.billNumber} completed")
                if (settings.value.autoPrintReceipt && printerManager.connectionState.value is PrinterConnectionState.Connected) {
                    printerManager.printSaleReceipt(saleWithItems, settings.value)
                }
            }.onFailure { err ->
                emitMessage(err.message ?: "Checkout failed")
            }
            _isCheckingOut.value = false
        }
    }

    fun showReceipt(saleWithItems: SaleWithItems) {
        _latestReceipt.value = saleWithItems
    }

    fun dismissReceipt() {
        _latestReceipt.value = null
    }

    fun updateSettings(transform: (AppSettingsEntity) -> AppSettingsEntity) {
        viewModelScope.launch {
            val next = transform(settings.value)
            repo.saveSettings(next)
        }
    }

    fun saveVendor(vendor: VendorEntity, isEdit: Boolean) {
        viewModelScope.launch {
            repo.saveVendor(vendor, isEdit)
            emitMessage(if (isEdit) "Vendor updated" else "Vendor added")
        }
    }

    fun deleteVendorProtected(vendor: VendorEntity) {
        requireAuthorization(ProtectedAction.VENDOR_SENSITIVE, vendor.vendorCode) {
            viewModelScope.launch {
                runCatching { repo.deleteVendor(vendor) }
                    .onSuccess { emitMessage("Vendor deleted") }
                    .onFailure { emitMessage("Cannot delete vendor with existing products") }
            }
        }
    }

    fun saveCategory(name: String, description: String, existing: CategoryEntity? = null) {
        viewModelScope.launch {
            runCatching { repo.saveCategory(name, description, existing) }
                .onSuccess { emitMessage("Category saved") }
                .onFailure { emitMessage(it.message ?: "Category error") }
        }
    }

    fun deleteCategoryProtected(category: CategoryEntity) {
        requireAuthorization(ProtectedAction.CATEGORY_SENSITIVE, category.categoryCode) {
            viewModelScope.launch {
                repo.deleteCategoryIfEmpty(category)
                    .onSuccess { emitMessage("Category deleted") }
                    .onFailure { emitMessage(it.message ?: "Delete blocked") }
            }
        }
    }

    fun saveSubcategory(categoryId: Long, name: String, existing: SubcategoryEntity? = null) {
        viewModelScope.launch {
            repo.saveSubcategory(categoryId, name, existing)
            emitMessage("Subcategory saved")
        }
    }

    fun saveProduct(product: ProductEntity, isEdit: Boolean, onDone: () -> Unit) {
        val action = {
            viewModelScope.launch {
                repo.saveProduct(product, isEdit, authorizedByAdmin = isEdit)
                    .onSuccess {
                        emitMessage(if (isEdit) "Product updated" else "Product registered")
                        onDone()
                    }
                    .onFailure { emitMessage(it.message ?: "Failed to save product") }
            }
        }
        if (isEdit) {
            requireAuthorization(ProtectedAction.PRODUCT_SENSITIVE, product.productCode) { action() }
        } else {
            action()
        }
    }

    fun adjustStockProtected(productId: Long, delta: Double, note: String) {
        requireAuthorization(ProtectedAction.STOCK_ADJUSTMENT, "PRD#$productId") {
            viewModelScope.launch {
                repo.adjustStock(productId, delta, "ADJUSTMENT", note, authorizedByAdmin = true)
                    .onSuccess { emitMessage("Stock adjusted") }
                    .onFailure { emitMessage(it.message ?: "Adjustment error") }
            }
        }
    }

    fun processExchangeProtected(
        originalSaleId: Long,
        returnedLines: List<ExchangeLineInput>,
        replacementLines: List<ExchangeLineInput>,
        reason: String,
        onSuccess: () -> Unit
    ) {
        requireAuthorization(ProtectedAction.PROCESS_EXCHANGE, "SALE#$originalSaleId") {
            viewModelScope.launch {
                repo.processExchange(originalSaleId, returnedLines, replacementLines, reason)
                    .onSuccess {
                        emitMessage("Exchange ${it.exchangeNumber} processed")
                        onSuccess()
                    }
                    .onFailure { emitMessage(it.message ?: "Exchange failed") }
            }
        }
    }
}

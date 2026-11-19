package com.bazarpos.retail.data.repository

import androidx.room.withTransaction
import com.bazarpos.retail.data.local.PosDatabase
import com.bazarpos.retail.data.local.entity.*
import com.bazarpos.retail.domain.BillNumberGenerator
import com.bazarpos.retail.domain.DhakaTime
import com.bazarpos.retail.domain.ExchangePolicy
import com.bazarpos.retail.domain.GpCalculator
import kotlinx.coroutines.flow.Flow

data class CartLineInput(
    val productId: Long,
    val quantity: Double,
    val unitPrice: Double
)

data class ExchangeLineInput(
    val productId: Long,
    val quantity: Double,
    val unitPrice: Double
)

class PosRepository(private val db: PosDatabase) {
    private val vendorDao = db.vendorDao()
    private val categoryDao = db.categoryDao()
    private val productDao = db.productDao()
    private val customerDao = db.customerDao()
    private val saleDao = db.saleDao()
    private val stockMovementDao = db.stockMovementDao()
    private val exchangeDao = db.exchangeDao()
    private val settingsDao = db.settingsDao()
    private val auditLogDao = db.auditLogDao()

    val vendorsFlow: Flow<List<VendorEntity>> = vendorDao.observeAll()
    val categoriesFlow: Flow<List<CategoryWithSubcategories>> = categoryDao.observeAllWithSubcategories()
    val productsFlow: Flow<List<ProductEntity>> = productDao.observeAll()
    val customersFlow: Flow<List<CustomerEntity>> = customerDao.observeAll()
    val salesFlow: Flow<List<SaleWithItems>> = saleDao.observeAllWithItems()
    val stockMovementsFlow: Flow<List<StockMovementEntity>> = stockMovementDao.observeRecent()
    val exchangesFlow: Flow<List<ExchangeWithItems>> = exchangeDao.observeAllWithItems()
    val settingsFlow: Flow<AppSettingsEntity?> = settingsDao.observeSettings()
    val auditLogsFlow: Flow<List<AuditLogEntity>> = auditLogDao.observeRecent()

    suspend fun getSettings(): AppSettingsEntity {
        return settingsDao.getSettings() ?: AppSettingsEntity().also { settingsDao.upsert(it) }
    }

    suspend fun saveSettings(settings: AppSettingsEntity) {
        settingsDao.upsert(settings)
    }

    suspend fun logAudit(actionType: String, targetReference: String, details: String) {
        auditLogDao.insert(
            AuditLogEntity(
                actionType = actionType,
                targetReference = targetReference,
                details = details
            )
        )
    }

    suspend fun saveVendor(vendor: VendorEntity, isEdit: Boolean): Long {
        return if (isEdit) {
            vendorDao.update(vendor)
            vendor.id
        } else {
            val code = BillNumberGenerator.nextCode("VND", vendorDao.maxId())
            vendorDao.insert(vendor.copy(vendorCode = code))
        }
    }

    suspend fun deleteVendor(vendor: VendorEntity) {
        vendorDao.delete(vendor)
    }

    suspend fun saveCategory(name: String, description: String, existing: CategoryEntity? = null): Long {
        return if (existing != null) {
            categoryDao.updateCategory(existing.copy(name = name.trim(), description = description.trim()))
            existing.id
        } else {
            val code = BillNumberGenerator.nextCode("CAT", categoryDao.maxCategoryId(), 3)
            categoryDao.insertCategory(CategoryEntity(categoryCode = code, name = name.trim(), description = description.trim()))
        }
    }

    suspend fun deleteCategoryIfEmpty(category: CategoryEntity): Result<Unit> {
        val count = categoryDao.countProductsInCategory(category.id)
        if (count > 0) {
            return Result.failure(IllegalStateException("Cannot delete category containing $count product(s). Reassign products first."))
        }
        categoryDao.deleteCategory(category)
        return Result.success(Unit)
    }

    suspend fun saveSubcategory(categoryId: Long, name: String, existing: SubcategoryEntity? = null): Long {
        return if (existing != null) {
            categoryDao.updateSubcategory(existing.copy(name = name.trim()))
            existing.id
        } else {
            val code = BillNumberGenerator.nextCode("SUB", categoryDao.maxSubcategoryId(), 3)
            categoryDao.insertSubcategory(SubcategoryEntity(subcategoryCode = code, categoryId = categoryId, name = name.trim()))
        }
    }

    suspend fun deleteSubcategoryIfEmpty(subcategory: SubcategoryEntity): Result<Unit> {
        val count = categoryDao.countProductsInSubcategory(subcategory.id)
        if (count > 0) {
            return Result.failure(IllegalStateException("Cannot delete subcategory containing $count product(s)."))
        }
        categoryDao.deleteSubcategory(subcategory)
        return Result.success(Unit)
    }

    suspend fun saveProduct(
        product: ProductEntity,
        isEdit: Boolean,
        authorizedByAdmin: Boolean
    ): Result<Long> = db.withTransaction {
        val normalizedBarcode = product.barcode.trim()
        val duplicate = productDao.getByBarcode(normalizedBarcode)
        if (duplicate != null && (!isEdit || duplicate.id != product.id)) {
            return@withTransaction Result.failure(IllegalArgumentException("Duplicate barcode '$normalizedBarcode' already registered to ${duplicate.name}."))
        }

        val gp = GpCalculator.calculate(product.purchasePrice, product.sellingPrice)
        if (isEdit) {
            val updated = product.copy(
                barcode = normalizedBarcode,
                gpAmount = gp.gpAmount,
                gpPercentage = gp.gpPercentage
            )
            productDao.update(updated)
            Result.success(updated.id)
        } else {
            val code = BillNumberGenerator.nextCode("PRD", productDao.maxId())
            val insertedId = productDao.insert(
                product.copy(
                    productCode = code,
                    barcode = normalizedBarcode,
                    gpAmount = gp.gpAmount,
                    gpPercentage = gp.gpPercentage
                )
            )
            if (product.currentStock > 0) {
                stockMovementDao.insert(
                    StockMovementEntity(
                        productId = insertedId,
                        productName = product.name,
                        barcode = normalizedBarcode,
                        movementType = "INITIAL",
                        quantity = product.currentStock,
                        previousStock = 0.0,
                        newStock = product.currentStock,
                        authorizedByAdmin = authorizedByAdmin,
                        note = "Initial stock on registration"
                    )
                )
            }
            Result.success(insertedId)
        }
    }

    suspend fun deleteProduct(product: ProductEntity) {
        productDao.delete(product)
    }

    suspend fun findProductByBarcode(barcode: String): ProductEntity? {
        return productDao.getByBarcode(barcode.trim())
    }

    suspend fun adjustStock(
        productId: Long,
        delta: Double,
        movementType: String,
        note: String,
        authorizedByAdmin: Boolean
    ): Result<Unit> = db.withTransaction {
        val product = productDao.getById(productId)
            ?: return@withTransaction Result.failure(IllegalArgumentException("Product not found"))
        val newStock = (product.currentStock + delta).coerceAtLeast(0.0)
        productDao.updateStock(product.id, newStock)
        stockMovementDao.insert(
            StockMovementEntity(
                productId = product.id,
                productName = product.name,
                barcode = product.barcode,
                movementType = movementType,
                quantity = delta,
                previousStock = product.currentStock,
                newStock = newStock,
                authorizedByAdmin = authorizedByAdmin,
                note = note
            )
        )
        if (authorizedByAdmin) {
            auditLogDao.insert(
                AuditLogEntity(
                    actionType = "STOCK_ADJUSTMENT",
                    targetReference = product.productCode,
                    details = "${product.name}: ${product.currentStock} -> $newStock ($note)"
                )
            )
        }
        Result.success(Unit)
    }

    /**
     * Single atomic Room transaction for:
     * 1. Generating unique YYYYMMDD-001 bill number in Asia/Dhaka timezone
     * 2. Validating stock & deducting quantities
     * 3. Upserting customer record (if mobile provided)
     * 4. Saving Sale + SaleItems + StockMovements
     */
    suspend fun completeSale(
        lines: List<CartLineInput>,
        discountAmount: Double,
        customerName: String,
        customerMobile: String,
        allowOverStockOverride: Boolean
    ): Result<SaleWithItems> = db.withTransaction {
        if (lines.isEmpty()) {
            return@withTransaction Result.failure(IllegalStateException("Cart is empty"))
        }

        val now = System.currentTimeMillis()
        val dateKey = DhakaTime.todayDateKey(now)
        val latestForDay = saleDao.getMaxBillNumberForDate(dateKey)
        val billNumber = BillNumberGenerator.nextBillNumber(dateKey, latestForDay)

        var subtotal = 0.0
        var totalQty = 0.0
        val resolvedProducts = mutableListOf<Pair<ProductEntity, CartLineInput>>()

        for (line in lines) {
            val product = productDao.getById(line.productId)
                ?: return@withTransaction Result.failure(IllegalStateException("Product ID ${line.productId} missing"))
            if (!allowOverStockOverride && line.quantity > product.currentStock) {
                return@withTransaction Result.failure(
                    IllegalStateException("Insufficient stock for ${product.name} (Available: ${product.currentStock})")
                )
            }
            subtotal += GpCalculator.round2(line.unitPrice * line.quantity)
            totalQty += line.quantity
            resolvedProducts += product to line
        }

        val safeDiscount = discountAmount.coerceIn(0.0, subtotal)
        val grandTotal = GpCalculator.round2(subtotal - safeDiscount)

        val cleanMobile = customerMobile.trim()
        val cleanName = customerName.trim()
        var customerId: Long? = null
        if (cleanMobile.isNotBlank()) {
            val existing = customerDao.getByMobile(cleanMobile)
            customerId = if (existing == null) {
                customerDao.insert(
                    CustomerEntity(
                        name = cleanName.ifBlank { "Walk-in Customer" },
                        mobile = cleanMobile,
                        totalSpent = grandTotal,
                        billCount = 1,
                        lastPurchaseAt = now
                    )
                )
            } else {
                customerDao.update(
                    existing.copy(
                        name = cleanName.ifBlank { existing.name },
                        totalSpent = GpCalculator.round2(existing.totalSpent + grandTotal),
                        billCount = existing.billCount + 1,
                        lastPurchaseAt = now
                    )
                )
                existing.id
            }
        }

        val saleId = saleDao.insertSale(
            SaleEntity(
                billNumber = billNumber,
                billDateKey = dateKey,
                customerId = customerId,
                customerName = cleanName,
                customerMobile = cleanMobile,
                subtotal = GpCalculator.round2(subtotal),
                discountAmount = GpCalculator.round2(safeDiscount),
                grandTotal = grandTotal,
                totalQuantity = totalQty,
                status = "COMPLETED",
                createdAt = now
            )
        )

        val saleItems = mutableListOf<SaleItemEntity>()
        for ((product, line) in resolvedProducts) {
            val lineSub = GpCalculator.round2(line.unitPrice * line.quantity)
            saleItems += SaleItemEntity(
                saleId = saleId,
                productId = product.id,
                productName = product.name,
                barcode = product.barcode,
                unit = product.unit,
                quantity = line.quantity,
                unitPrice = line.unitPrice,
                purchasePriceAtSale = product.purchasePrice,
                subtotal = lineSub
            )

            val newStock = (product.currentStock - line.quantity).coerceAtLeast(0.0)
            productDao.updateStock(product.id, newStock)
            stockMovementDao.insert(
                StockMovementEntity(
                    productId = product.id,
                    productName = product.name,
                    barcode = product.barcode,
                    movementType = "SALE",
                    quantity = -line.quantity,
                    previousStock = product.currentStock,
                    newStock = newStock,
                    referenceBillId = billNumber,
                    authorizedByAdmin = allowOverStockOverride,
                    note = "POS Sale $billNumber",
                    createdAt = now
                )
            )
        }
        saleDao.insertSaleItems(saleItems)

        if (safeDiscount > 0.0) {
            auditLogDao.insert(
                AuditLogEntity(
                    actionType = "POS_DISCOUNT",
                    targetReference = billNumber,
                    details = "Authorized discount of ৳$safeDiscount on bill $billNumber"
                )
            )
        }

        val saved = saleDao.getSaleWithItems(saleId)
            ?: return@withTransaction Result.failure(IllegalStateException("Failed to reload saved bill"))
        Result.success(saved)
    }

    /**
     * 3-day Exchange processing (No cash refunds; original sale record preserved).
     */
    suspend fun processExchange(
        originalSaleId: Long,
        returnedLines: List<ExchangeLineInput>,
        replacementLines: List<ExchangeLineInput>,
        reason: String
    ): Result<ExchangeEntity> = db.withTransaction {
        val original = saleDao.getSaleWithItems(originalSaleId)
            ?: return@withTransaction Result.failure(IllegalArgumentException("Original bill not found"))
        if (!ExchangePolicy.isEligibleForExchange(original.sale.createdAt)) {
            return@withTransaction Result.failure(IllegalStateException("Exchange window expired (must be within 3 days of purchase)."))
        }
        if (returnedLines.isEmpty()) {
            return@withTransaction Result.failure(IllegalArgumentException("Select at least one item to return."))
        }

        val now = System.currentTimeMillis()
        val returnedTotal = GpCalculator.round2(returnedLines.sumOf { it.quantity * it.unitPrice })
        val replacementTotal = GpCalculator.round2(replacementLines.sumOf { it.quantity * it.unitPrice })
        val netDiff = GpCalculator.round2(replacementTotal - returnedTotal)

        if (netDiff < 0.0) {
            return@withTransaction Result.failure(
                IllegalStateException("No cash refund is available. Replacement value must be >= returned value.")
            )
        }

        val exNumber = "EXC-${DhakaTime.todayDateKey(now)}-${(exchangeDao.count() + 1).toString().padStart(3, '0')}"
        val exchangeId = exchangeDao.insertExchange(
            ExchangeEntity(
                exchangeNumber = exNumber,
                originalSaleId = original.sale.id,
                originalBillNumber = original.sale.billNumber,
                returnedTotal = returnedTotal,
                replacementTotal = replacementTotal,
                netDifference = netDiff,
                reason = reason,
                authorizedByAdmin = true,
                createdAt = now
            )
        )

        val exchangeItems = mutableListOf<ExchangeItemEntity>()
        for (ret in returnedLines) {
            val product = productDao.getById(ret.productId) ?: continue
            val newStock = product.currentStock + ret.quantity
            productDao.updateStock(product.id, newStock)
            stockMovementDao.insert(
                StockMovementEntity(
                    productId = product.id,
                    productName = product.name,
                    barcode = product.barcode,
                    movementType = "EXCHANGE_RETURN",
                    quantity = ret.quantity,
                    previousStock = product.currentStock,
                    newStock = newStock,
                    referenceBillId = original.sale.billNumber,
                    authorizedByAdmin = true,
                    note = "Returned via $exNumber",
                    createdAt = now
                )
            )
            exchangeItems += ExchangeItemEntity(
                exchangeId = exchangeId,
                productId = product.id,
                productName = product.name,
                barcode = product.barcode,
                direction = "RETURNED",
                quantity = ret.quantity,
                unitPrice = ret.unitPrice,
                subtotal = GpCalculator.round2(ret.quantity * ret.unitPrice)
            )
        }

        for (rep in replacementLines) {
            val product = productDao.getById(rep.productId)
                ?: return@withTransaction Result.failure(IllegalStateException("Replacement product missing"))
            if (rep.quantity > product.currentStock) {
                return@withTransaction Result.failure(IllegalStateException("Insufficient stock for replacement ${product.name}"))
            }
            val newStock = product.currentStock - rep.quantity
            productDao.updateStock(product.id, newStock)
            stockMovementDao.insert(
                StockMovementEntity(
                    productId = product.id,
                    productName = product.name,
                    barcode = product.barcode,
                    movementType = "EXCHANGE_OUT",
                    quantity = -rep.quantity,
                    previousStock = product.currentStock,
                    newStock = newStock,
                    referenceBillId = original.sale.billNumber,
                    authorizedByAdmin = true,
                    note = "Replacement via $exNumber",
                    createdAt = now
                )
            )
            exchangeItems += ExchangeItemEntity(
                exchangeId = exchangeId,
                productId = product.id,
                productName = product.name,
                barcode = product.barcode,
                direction = "REPLACEMENT",
                quantity = rep.quantity,
                unitPrice = rep.unitPrice,
                subtotal = GpCalculator.round2(rep.quantity * rep.unitPrice)
            )
        }

        exchangeDao.insertExchangeItems(exchangeItems)
        saleDao.updateStatus(original.sale.id, "EXCHANGED")
        auditLogDao.insert(
            AuditLogEntity(
                actionType = "EXCHANGE_PROCESSED",
                targetReference = original.sale.billNumber,
                details = "Exchange $exNumber linked to ${original.sale.billNumber}. Net diff: ৳$netDiff"
            )
        )

        Result.success(
            ExchangeEntity(
                id = exchangeId,
                exchangeNumber = exNumber,
                originalSaleId = original.sale.id,
                originalBillNumber = original.sale.billNumber,
                returnedTotal = returnedTotal,
                replacementTotal = replacementTotal,
                netDifference = netDiff,
                reason = reason,
                authorizedByAdmin = true,
                createdAt = now
            )
        )
    }

    suspend fun getSalesBetween(fromMillis: Long, toMillis: Long): List<SaleEntity> =
        saleDao.getSalesBetween(fromMillis, toMillis)

    suspend fun getSaleItemsBetween(fromMillis: Long, toMillis: Long): List<SaleItemEntity> =
        saleDao.getSaleItemsBetween(fromMillis, toMillis)
}

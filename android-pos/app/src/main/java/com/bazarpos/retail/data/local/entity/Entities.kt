package com.bazarpos.retail.data.local.entity

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation

@Entity(
    tableName = "vendors",
    indices = [
        Index(value = ["vendorCode"], unique = true),
        Index(value = ["name"])
    ]
)
data class VendorEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val vendorCode: String,
    val name: String,
    val contactPerson: String,
    val mobile: String,
    val altPhone: String = "",
    val address: String = "",
    val notes: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "categories",
    indices = [
        Index(value = ["categoryCode"], unique = true),
        Index(value = ["name"], unique = true)
    ]
)
data class CategoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val categoryCode: String,
    val name: String,
    val description: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "subcategories",
    foreignKeys = [
        ForeignKey(
            entity = CategoryEntity::class,
            parentColumns = ["id"],
            childColumns = ["categoryId"],
            onDelete = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["subcategoryCode"], unique = true),
        Index(value = ["categoryId"])
    ]
)
data class SubcategoryEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val subcategoryCode: String,
    val categoryId: Long,
    val name: String,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "products",
    foreignKeys = [
        ForeignKey(
            entity = VendorEntity::class,
            parentColumns = ["id"],
            childColumns = ["vendorId"],
            onDelete = ForeignKey.RESTRICT
        ),
        ForeignKey(
            entity = CategoryEntity::class,
            parentColumns = ["id"],
            childColumns = ["categoryId"],
            onDelete = ForeignKey.RESTRICT
        ),
        ForeignKey(
            entity = SubcategoryEntity::class,
            parentColumns = ["id"],
            childColumns = ["subcategoryId"],
            onDelete = ForeignKey.SET_NULL
        )
    ],
    indices = [
        Index(value = ["productCode"], unique = true),
        Index(value = ["barcode"], unique = true),
        Index(value = ["vendorId"]),
        Index(value = ["categoryId"]),
        Index(value = ["subcategoryId"]),
        Index(value = ["name"])
    ]
)
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val productCode: String,
    val vendorId: Long,
    val categoryId: Long,
    val subcategoryId: Long? = null,
    val barcode: String,
    val name: String,
    val description: String = "",
    val purchasePrice: Double,
    val sellingPrice: Double,
    val gpAmount: Double,
    val gpPercentage: Double,
    val currentStock: Double,
    val minStockAlert: Double = 5.0,
    val unit: String = "piece",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "customers",
    indices = [
        Index(value = ["mobile"], unique = true)
    ]
)
data class CustomerEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val mobile: String,
    val totalSpent: Double = 0.0,
    val billCount: Int = 0,
    val lastPurchaseAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "sales",
    foreignKeys = [
        ForeignKey(
            entity = CustomerEntity::class,
            parentColumns = ["id"],
            childColumns = ["customerId"],
            onDelete = ForeignKey.SET_NULL
        )
    ],
    indices = [
        Index(value = ["billNumber"], unique = true),
        Index(value = ["billDateKey"]),
        Index(value = ["customerId"]),
        Index(value = ["customerMobile"]),
        Index(value = ["createdAt"])
    ]
)
data class SaleEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val billNumber: String,
    val billDateKey: String,
    val customerId: Long? = null,
    val customerName: String = "",
    val customerMobile: String = "",
    val subtotal: Double,
    val discountAmount: Double = 0.0,
    val grandTotal: Double,
    val totalQuantity: Double,
    val status: String = "COMPLETED", // COMPLETED, EXCHANGED, CANCELLED
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "sale_items",
    foreignKeys = [
        ForeignKey(
            entity = SaleEntity::class,
            parentColumns = ["id"],
            childColumns = ["saleId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ProductEntity::class,
            parentColumns = ["id"],
            childColumns = ["productId"],
            onDelete = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["saleId"]),
        Index(value = ["productId"])
    ]
)
data class SaleItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val saleId: Long,
    val productId: Long,
    val productName: String,
    val barcode: String,
    val unit: String,
    val quantity: Double,
    val unitPrice: Double,
    val purchasePriceAtSale: Double,
    val subtotal: Double
)

@Entity(
    tableName = "stock_movements",
    foreignKeys = [
        ForeignKey(
            entity = ProductEntity::class,
            parentColumns = ["id"],
            childColumns = ["productId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["productId"]),
        Index(value = ["createdAt"]),
        Index(value = ["referenceBillId"])
    ]
)
data class StockMovementEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val productId: Long,
    val productName: String,
    val barcode: String,
    val movementType: String, // INITIAL, PURCHASE, SALE, ADJUSTMENT, EXCHANGE_RETURN, EXCHANGE_OUT
    val quantity: Double,
    val previousStock: Double,
    val newStock: Double,
    val referenceBillId: String = "",
    val authorizedByAdmin: Boolean = false,
    val note: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "exchanges",
    foreignKeys = [
        ForeignKey(
            entity = SaleEntity::class,
            parentColumns = ["id"],
            childColumns = ["originalSaleId"],
            onDelete = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["originalSaleId"]),
        Index(value = ["exchangeNumber"], unique = true)
    ]
)
data class ExchangeEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val exchangeNumber: String,
    val originalSaleId: Long,
    val originalBillNumber: String,
    val returnedTotal: Double,
    val replacementTotal: Double,
    val netDifference: Double,
    val reason: String = "",
    val authorizedByAdmin: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(
    tableName = "exchange_items",
    foreignKeys = [
        ForeignKey(
            entity = ExchangeEntity::class,
            parentColumns = ["id"],
            childColumns = ["exchangeId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = ProductEntity::class,
            parentColumns = ["id"],
            childColumns = ["productId"],
            onDelete = ForeignKey.RESTRICT
        )
    ],
    indices = [
        Index(value = ["exchangeId"]),
        Index(value = ["productId"])
    ]
)
data class ExchangeItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val exchangeId: Long,
    val productId: Long,
    val productName: String,
    val barcode: String,
    val direction: String, // RETURNED, REPLACEMENT
    val quantity: Double,
    val unitPrice: Double,
    val subtotal: Double
)

@Entity(tableName = "app_settings")
data class AppSettingsEntity(
    @PrimaryKey val id: Int = 1,
    val storeName: String = "BazarPOS Retail Store",
    val storeAddress: String = "Dhaka, Bangladesh",
    val storePhone: String = "+880 1700-000000",
    val storeLogoUri: String = "",
    val currencySymbol: String = "৳",
    val language: String = "en", // "en" or "bn"
    val darkTheme: Boolean = false,
    val paperWidthMm: Int = 58, // 58 or 80
    val lastPrinterName: String = "",
    val lastPrinterAddress: String = "",
    val autoPrintReceipt: Boolean = true,
    val lowStockAlertEnabled: Boolean = true,
    val englishReturnPolicy: String = "Products may be exchanged within 3 days of purchase with the original bill. No cash refund is available.",
    val banglaReturnPolicy: String = "ক্রয়ের ৩ দিনের মধ্যে মূল বিলসহ পণ্য এক্সচেঞ্জ করা যাবে। কোনো নগদ টাকা ফেরত দেওয়া হবে না।",
    val receiptFooterNote: String = "Thank you for shopping with us!",
    val adminPasswordHash: String = "",
    val adminPasswordSalt: String = "",
    val protectProductOps: Boolean = true,
    val protectVendorOps: Boolean = true,
    val protectCategoryOps: Boolean = true,
    val protectStockAdjust: Boolean = true,
    val protectPosRemoval: Boolean = true,
    val protectPosDiscount: Boolean = true,
    val protectBillCancel: Boolean = true,
    val protectSensitiveReports: Boolean = false
)

@Entity(
    tableName = "audit_logs",
    indices = [Index(value = ["createdAt"])]
)
data class AuditLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val actionType: String,
    val targetReference: String,
    val details: String,
    val createdAt: Long = System.currentTimeMillis()
)

// Relational POJOs
data class CategoryWithSubcategories(
    @Embedded val category: CategoryEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "categoryId"
    )
    val subcategories: List<SubcategoryEntity>
)

data class SaleWithItems(
    @Embedded val sale: SaleEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "saleId"
    )
    val items: List<SaleItemEntity>
)

data class ExchangeWithItems(
    @Embedded val exchange: ExchangeEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "exchangeId"
    )
    val items: List<ExchangeItemEntity>
)

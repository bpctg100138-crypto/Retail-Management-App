package com.bazarpos.retail.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.bazarpos.retail.data.local.dao.*
import com.bazarpos.retail.data.local.entity.*

@Database(
    entities = [
        VendorEntity::class,
        CategoryEntity::class,
        SubcategoryEntity::class,
        ProductEntity::class,
        CustomerEntity::class,
        SaleEntity::class,
        SaleItemEntity::class,
        StockMovementEntity::class,
        ExchangeEntity::class,
        ExchangeItemEntity::class,
        AppSettingsEntity::class,
        AuditLogEntity::class
    ],
    version = 1,
    exportSchema = true
)
abstract class PosDatabase : RoomDatabase() {
    abstract fun vendorDao(): VendorDao
    abstract fun categoryDao(): CategoryDao
    abstract fun productDao(): ProductDao
    abstract fun customerDao(): CustomerDao
    abstract fun saleDao(): SaleDao
    abstract fun stockMovementDao(): StockMovementDao
    abstract fun exchangeDao(): ExchangeDao
    abstract fun settingsDao(): SettingsDao
    abstract fun auditLogDao(): AuditLogDao

    companion object {
        const val DB_NAME = "bazar_pos.db"

        @Volatile
        private var INSTANCE: PosDatabase? = null

        // Example schema migration template for future upgrades
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Preserved for forward-compatible schema evolution
            }
        }

        fun getInstance(context: Context): PosDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    PosDatabase::class.java,
                    DB_NAME
                )
                    .addCallback(object : Callback() {
                        override fun onCreate(db: SupportSQLiteDatabase) {
                            super.onCreate(db)
                            db.execSQL(
                                """
                                INSERT OR IGNORE INTO app_settings (
                                    id, storeName, storeAddress, storePhone, storeLogoUri,
                                    currencySymbol, language, darkTheme, paperWidthMm,
                                    lastPrinterName, lastPrinterAddress, autoPrintReceipt,
                                    lowStockAlertEnabled, englishReturnPolicy, banglaReturnPolicy,
                                    receiptFooterNote, adminPasswordHash, adminPasswordSalt,
                                    protectProductOps, protectVendorOps, protectCategoryOps,
                                    protectStockAdjust, protectPosRemoval, protectPosDiscount,
                                    protectBillCancel, protectSensitiveReports
                                ) VALUES (
                                    1, 'BazarPOS Retail Store', 'Dhaka, Bangladesh', '+880 1700-000000', '',
                                    '৳', 'en', 0, 58,
                                    '', '', 1,
                                    1,
                                    'Products may be exchanged within 3 days of purchase with the original bill. No cash refund is available.',
                                    'ক্রয়ের ৩ দিনের মধ্যে মূল বিলসহ পণ্য এক্সচেঞ্জ করা যাবে। কোনো নগদ টাকা ফেরত দেওয়া হবে না।',
                                    'Thank you for shopping with us!', '', '',
                                    1, 1, 1, 1, 1, 1, 1, 0
                                )
                                """.trimIndent()
                            )
                        }
                    })
                    .build()
                INSTANCE = instance
                instance
            }
        }

        fun closeAndReset() {
            synchronized(this) {
                INSTANCE?.close()
                INSTANCE = null
            }
        }
    }
}

package com.bazarpos.retail.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.bazarpos.retail.data.local.entity.*
import kotlinx.coroutines.flow.Flow

@Dao
interface VendorDao {
    @Query("SELECT * FROM vendors ORDER BY id DESC")
    fun observeAll(): Flow<List<VendorEntity>>

    @Query("SELECT * FROM vendors ORDER BY name ASC")
    suspend fun getAll(): List<VendorEntity>

    @Query("SELECT * FROM vendors WHERE id = :id")
    suspend fun getById(id: Long): VendorEntity?

    @Query("SELECT COUNT(*) FROM vendors")
    suspend fun count(): Int

    @Query("SELECT MAX(id) FROM vendors")
    suspend fun maxId(): Long?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(vendor: VendorEntity): Long

    @Update
    suspend fun update(vendor: VendorEntity)

    @Delete
    suspend fun delete(vendor: VendorEntity)
}

@Dao
interface CategoryDao {
    @Transaction
    @Query("SELECT * FROM categories ORDER BY name ASC")
    fun observeAllWithSubcategories(): Flow<List<CategoryWithSubcategories>>

    @Query("SELECT * FROM categories ORDER BY name ASC")
    suspend fun getAll(): List<CategoryEntity>

    @Query("SELECT MAX(id) FROM categories")
    suspend fun maxCategoryId(): Long?

    @Query("SELECT MAX(id) FROM subcategories")
    suspend fun maxSubcategoryId(): Long?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertCategory(category: CategoryEntity): Long

    @Update
    suspend fun updateCategory(category: CategoryEntity)

    @Delete
    suspend fun deleteCategory(category: CategoryEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertSubcategory(subcategory: SubcategoryEntity): Long

    @Update
    suspend fun updateSubcategory(subcategory: SubcategoryEntity)

    @Delete
    suspend fun deleteSubcategory(subcategory: SubcategoryEntity)

    @Query("SELECT COUNT(*) FROM products WHERE categoryId = :categoryId")
    suspend fun countProductsInCategory(categoryId: Long): Int

    @Query("SELECT COUNT(*) FROM products WHERE subcategoryId = :subcategoryId")
    suspend fun countProductsInSubcategory(subcategoryId: Long): Int
}

@Dao
interface ProductDao {
    @Query("SELECT * FROM products ORDER BY id DESC")
    fun observeAll(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products ORDER BY name ASC")
    suspend fun getAll(): List<ProductEntity>

    @Query("SELECT * FROM products WHERE id = :id")
    suspend fun getById(id: Long): ProductEntity?

    @Query("SELECT * FROM products WHERE barcode = :barcode LIMIT 1")
    suspend fun getByBarcode(barcode: String): ProductEntity?

    @Query("SELECT * FROM products WHERE vendorId = :vendorId ORDER BY name ASC")
    fun observeByVendor(vendorId: Long): Flow<List<ProductEntity>>

    @Query("SELECT MAX(id) FROM products")
    suspend fun maxId(): Long?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(product: ProductEntity): Long

    @Update
    suspend fun update(product: ProductEntity)

    @Delete
    suspend fun delete(product: ProductEntity)

    @Query("UPDATE products SET currentStock = :newStock WHERE id = :productId")
    suspend fun updateStock(productId: Long, newStock: Double)
}

@Dao
interface CustomerDao {
    @Query("SELECT * FROM customers ORDER BY lastPurchaseAt DESC")
    fun observeAll(): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE mobile = :mobile LIMIT 1")
    suspend fun getByMobile(mobile: String): CustomerEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(customer: CustomerEntity): Long

    @Update
    suspend fun update(customer: CustomerEntity)
}

@Dao
interface SaleDao {
    @Transaction
    @Query("SELECT * FROM sales ORDER BY createdAt DESC")
    fun observeAllWithItems(): Flow<List<SaleWithItems>>

    @Transaction
    @Query("SELECT * FROM sales WHERE id = :saleId")
    suspend fun getSaleWithItems(saleId: Long): SaleWithItems?

    @Transaction
    @Query("SELECT * FROM sales WHERE billNumber = :billNumber LIMIT 1")
    suspend fun getByBillNumber(billNumber: String): SaleWithItems?

    @Query("SELECT MAX(billNumber) FROM sales WHERE billDateKey = :dateKey")
    suspend fun getMaxBillNumberForDate(dateKey: String): String?

    @Query("SELECT * FROM sales WHERE createdAt BETWEEN :fromMillis AND :toMillis ORDER BY createdAt DESC")
    suspend fun getSalesBetween(fromMillis: Long, toMillis: Long): List<SaleEntity>

    @Query("SELECT * FROM sale_items WHERE saleId IN (SELECT id FROM sales WHERE createdAt BETWEEN :fromMillis AND :toMillis AND status != 'CANCELLED')")
    suspend fun getSaleItemsBetween(fromMillis: Long, toMillis: Long): List<SaleItemEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertSale(sale: SaleEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertSaleItems(items: List<SaleItemEntity>)

    @Query("UPDATE sales SET status = :status WHERE id = :saleId")
    suspend fun updateStatus(saleId: Long, status: String)
}

@Dao
interface StockMovementDao {
    @Query("SELECT * FROM stock_movements ORDER BY createdAt DESC LIMIT 500")
    fun observeRecent(): Flow<List<StockMovementEntity>>

    @Query("SELECT * FROM stock_movements WHERE productId = :productId ORDER BY createdAt DESC")
    fun observeByProduct(productId: Long): Flow<List<StockMovementEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(movement: StockMovementEntity): Long
}

@Dao
interface ExchangeDao {
    @Transaction
    @Query("SELECT * FROM exchanges ORDER BY createdAt DESC")
    fun observeAllWithItems(): Flow<List<ExchangeWithItems>>

    @Query("SELECT COUNT(*) FROM exchanges")
    suspend fun count(): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertExchange(exchange: ExchangeEntity): Long

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertExchangeItems(items: List<ExchangeItemEntity>)
}

@Dao
interface SettingsDao {
    @Query("SELECT * FROM app_settings WHERE id = 1")
    fun observeSettings(): Flow<AppSettingsEntity?>

    @Query("SELECT * FROM app_settings WHERE id = 1")
    suspend fun getSettings(): AppSettingsEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(settings: AppSettingsEntity)
}

@Dao
interface AuditLogDao {
    @Query("SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT 300")
    fun observeRecent(): Flow<List<AuditLogEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(log: AuditLogEntity): Long
}

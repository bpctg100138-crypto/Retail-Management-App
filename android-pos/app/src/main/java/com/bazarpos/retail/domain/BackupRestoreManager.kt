package com.bazarpos.retail.domain

import android.content.Context
import android.net.Uri
import com.bazarpos.retail.data.local.PosDatabase
import com.bazarpos.retail.data.local.entity.ProductEntity
import com.bazarpos.retail.data.local.entity.SaleWithItems
import com.bazarpos.retail.data.local.entity.VendorEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object BackupRestoreManager {

    suspend fun exportDatabaseToUri(context: Context, targetUri: Uri): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val db = PosDatabase.getInstance(context)
            // Flush SQLite WAL journal into main db file before copying
            db.openHelper.writableDatabase.query("PRAGMA wal_checkpoint(FULL)").close()
            val dbFile: File = context.getDatabasePath(PosDatabase.DB_NAME)
            if (!dbFile.exists()) {
                return@withContext Result.failure(IllegalStateException("Database file not found"))
            }
            context.contentResolver.openOutputStream(targetUri)?.use { out ->
                FileInputStream(dbFile).use { input ->
                    input.copyTo(out)
                }
            } ?: return@withContext Result.failure(IllegalStateException("Unable to open destination file"))
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun restoreDatabaseFromUri(context: Context, sourceUri: Uri): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val tempFile = File(context.cacheDir, "restore_candidate.db")
            context.contentResolver.openInputStream(sourceUri)?.use { input ->
                FileOutputStream(tempFile).use { out ->
                    input.copyTo(out)
                }
            } ?: return@withContext Result.failure(IllegalStateException("Unable to read backup file"))

            // Basic SQLite header check ("SQLite format 3\u0000")
            val header = ByteArray(16)
            FileInputStream(tempFile).use { it.read(header) }
            val headerStr = String(header, 0, 15, Charsets.US_ASCII)
            if (!headerStr.startsWith("SQLite format 3")) {
                tempFile.delete()
                return@withContext Result.failure(IllegalArgumentException("Invalid SQLite backup file"))
            }

            PosDatabase.closeAndReset()
            val dbFile = context.getDatabasePath(PosDatabase.DB_NAME)
            File(dbFile.absolutePath + "-wal").delete()
            File(dbFile.absolutePath + "-shm").delete()
            tempFile.copyTo(dbFile, overwrite = true)
            tempFile.delete()
            // Re-open fresh instance
            PosDatabase.getInstance(context)
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun exportCsvToUri(context: Context, targetUri: Uri, csvContent: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                context.contentResolver.openOutputStream(targetUri)?.use { out ->
                    out.write(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())) // UTF-8 BOM for Bangla in Excel
                    out.write(csvContent.toByteArray(Charsets.UTF_8))
                } ?: return@withContext Result.failure(IllegalStateException("Cannot write CSV"))
                Result.success(Unit)
            } catch (e: Exception) {
                Result.failure(e)
            }
        }

    fun buildProductsCsv(products: List<ProductEntity>): String {
        val sb = StringBuilder("ProductCode,Name,Barcode,PurchasePrice,SellingPrice,GPAmount,GPPercent,Stock,MinAlert,Unit\n")
        products.forEach { p ->
            sb.append("${csv(p.productCode)},${csv(p.name)},${csv(p.barcode)},${p.purchasePrice},${p.sellingPrice},${p.gpAmount},${p.gpPercentage},${p.currentStock},${p.minStockAlert},${csv(p.unit)}\n")
        }
        return sb.toString()
    }

    fun buildVendorsCsv(vendors: List<VendorEntity>): String {
        val sb = StringBuilder("VendorCode,Name,ContactPerson,Mobile,AltPhone,Address,Notes\n")
        vendors.forEach { v ->
            sb.append("${csv(v.vendorCode)},${csv(v.name)},${csv(v.contactPerson)},${csv(v.mobile)},${csv(v.altPhone)},${csv(v.address)},${csv(v.notes)}\n")
        }
        return sb.toString()
    }

    fun buildSalesCsv(sales: List<SaleWithItems>): String {
        val sb = StringBuilder("BillNumber,Date,CustomerName,CustomerMobile,TotalQty,Subtotal,Discount,GrandTotal,Status\n")
        sales.forEach { sw ->
            val s = sw.sale
            sb.append("${csv(s.billNumber)},${csv(DhakaTime.formatDateTime(s.createdAt))},${csv(s.customerName)},${csv(s.customerMobile)},${s.totalQuantity},${s.subtotal},${s.discountAmount},${s.grandTotal},${csv(s.status)}\n")
        }
        return sb.toString()
    }

    private fun csv(raw: String): String {
        val escaped = raw.replace("\"", "\"\"")
        return "\"$escaped\""
    }
}

package com.bazarpos.retail.domain

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.bazarpos.retail.data.local.entity.AppSettingsEntity
import com.bazarpos.retail.data.local.entity.SaleWithItems
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.UUID

data class BluetoothPrinterInfo(
    val name: String,
    val address: String,
    val bonded: Boolean
)

sealed class PrinterConnectionState {
    data object Disconnected : PrinterConnectionState()
    data class Connecting(val deviceName: String) : PrinterConnectionState()
    data class Connected(val deviceName: String, val address: String) : PrinterConnectionState()
    data class Error(val message: String) : PrinterConnectionState()
}

class EscPosPrinterManager(private val context: Context) {
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null

    private val _connectionState = MutableStateFlow<PrinterConnectionState>(PrinterConnectionState.Disconnected)
    val connectionState: StateFlow<PrinterConnectionState> = _connectionState.asStateFlow()

    private val bluetoothAdapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    @SuppressLint("MissingPermission")
    fun getPairedPrinters(): List<BluetoothPrinterInfo> {
        val adapter = bluetoothAdapter ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()
        return try {
            adapter.bondedDevices?.map { dev ->
                BluetoothPrinterInfo(
                    name = dev.name ?: "Bluetooth Printer",
                    address = dev.address,
                    bonded = true
                )
            }?.sortedBy { it.name } ?: emptyList()
        } catch (_: SecurityException) {
            emptyList()
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun connect(address: String, fallbackName: String = "Thermal Printer"): Result<BluetoothPrinterInfo> =
        withContext(Dispatchers.IO) {
            try {
                disconnect()
                val adapter = bluetoothAdapter ?: return@withContext Result.failure(IllegalStateException("Bluetooth unavailable"))
                val device: BluetoothDevice = adapter.getRemoteDevice(address)
                val name = try { device.name ?: fallbackName } catch (_: SecurityException) { fallbackName }
                _connectionState.value = PrinterConnectionState.Connecting(name)

                try { adapter.cancelDiscovery() } catch (_: SecurityException) {}

                val rfcomm = device.createRfcommSocketToServiceRecord(sppUuid)
                rfcomm.connect()
                socket = rfcomm
                outputStream = rfcomm.outputStream
                _connectionState.value = PrinterConnectionState.Connected(name, address)
                Result.success(BluetoothPrinterInfo(name, address, true))
            } catch (e: Exception) {
                _connectionState.value = PrinterConnectionState.Error(e.message ?: "Printer connection failed")
                disconnectQuietly()
                Result.failure(e)
            }
        }

    fun disconnect() {
        disconnectQuietly()
        _connectionState.value = PrinterConnectionState.Disconnected
    }

    private fun disconnectQuietly() {
        try { outputStream?.close() } catch (_: Exception) {}
        try { socket?.close() } catch (_: Exception) {}
        outputStream = null
        socket = null
    }

    suspend fun printTestPage(settings: AppSettingsEntity): Result<Unit> = withContext(Dispatchers.IO) {
        val stream = outputStream ?: return@withContext Result.failure(IllegalStateException("Printer not connected"))
        return@withContext try {
            val bytes = ByteArrayOutputStream()
            bytes.write(byteArrayOf(0x1B, 0x40)) // ESC @ Init
            bytes.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
            bytes.write("${settings.storeName}\n".toByteArray(Charsets.UTF_8))
            bytes.write("ESC/POS Printer Test (${settings.paperWidthMm}mm)\n".toByteArray(Charsets.UTF_8))
            bytes.write("Date: ${DhakaTime.formatDateTime(System.currentTimeMillis())}\n".toByteArray(Charsets.UTF_8))
            bytes.write("--------------------------------\n".toByteArray(Charsets.UTF_8))
            // Bangla raster test line so printers without Bengali codepage print cleanly
            bytes.write(renderTextToEscPosRaster("বাংলা প্রিন্ট টেস্ট সফল হয়েছে", settings.paperWidthMm))
            bytes.write(byteArrayOf(0x1B, 0x64, 0x04)) // Feed 4 lines
            bytes.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // Cut paper
            stream.write(bytes.toByteArray())
            stream.flush()
            Result.success(Unit)
        } catch (e: Exception) {
            _connectionState.value = PrinterConnectionState.Error(e.message ?: "Test print failed")
            Result.failure(e)
        }
    }

    suspend fun printSaleReceipt(saleWithItems: SaleWithItems, settings: AppSettingsEntity): Result<Unit> =
        withContext(Dispatchers.IO) {
            val stream = outputStream ?: return@withContext Result.failure(IllegalStateException("Printer not connected"))
            return@withContext try {
                val payload = buildEscPosReceiptPayload(saleWithItems, settings)
                stream.write(payload)
                stream.flush()
                Result.success(Unit)
            } catch (e: Exception) {
                _connectionState.value = PrinterConnectionState.Error(e.message ?: "Print error")
                Result.failure(e)
            }
        }

    fun buildEscPosReceiptPayload(saleWithItems: SaleWithItems, settings: AppSettingsEntity): ByteArray {
        val cols = if (settings.paperWidthMm >= 80) 48 else 32
        val sep = "-".repeat(cols)
        val sale = saleWithItems.sale
        val out = ByteArrayOutputStream()

        out.write(byteArrayOf(0x1B, 0x40)) // ESC @ Initialize
        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center align
        out.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold ON
        out.write("${settings.storeName}\n".toByteArray(Charsets.UTF_8))
        out.write(byteArrayOf(0x1B, 0x45, 0x00)) // Bold OFF
        out.write("${settings.storeAddress}\n".toByteArray(Charsets.UTF_8))
        out.write("Tel: ${settings.storePhone}\n".toByteArray(Charsets.UTF_8))
        out.write("$sep\n".toByteArray(Charsets.UTF_8))

        out.write(byteArrayOf(0x1B, 0x61, 0x00)) // Left align
        out.write("Bill: ${sale.billNumber}\n".toByteArray(Charsets.UTF_8))
        out.write("Date: ${DhakaTime.formatDateTime(sale.createdAt)}\n".toByteArray(Charsets.UTF_8))
        if (sale.customerName.isNotBlank() || sale.customerMobile.isNotBlank()) {
            out.write("Cust: ${sale.customerName} ${sale.customerMobile}\n".toByteArray(Charsets.UTF_8))
        }
        out.write("$sep\n".toByteArray(Charsets.UTF_8))

        saleWithItems.items.forEach { item ->
            out.write("${item.productName}\n".toByteArray(Charsets.UTF_8))
            val left = "  ${trimQty(item.quantity)} x ${formatPlainMoney(item.unitPrice)}"
            val right = formatPlainMoney(item.subtotal)
            out.write("${padColumns(left, right, cols)}\n".toByteArray(Charsets.UTF_8))
        }

        out.write("$sep\n".toByteArray(Charsets.UTF_8))
        out.write("${padColumns("Total Qty:", trimQty(sale.totalQuantity), cols)}\n".toByteArray(Charsets.UTF_8))
        out.write("${padColumns("Subtotal:", "${settings.currencySymbol}${formatPlainMoney(sale.subtotal)}", cols)}\n".toByteArray(Charsets.UTF_8))
        if (sale.discountAmount > 0.0) {
            out.write("${padColumns("Discount:", "-${settings.currencySymbol}${formatPlainMoney(sale.discountAmount)}", cols)}\n".toByteArray(Charsets.UTF_8))
        }
        out.write(byteArrayOf(0x1B, 0x45, 0x01)) // Bold
        out.write("${padColumns("GRAND TOTAL:", "${settings.currencySymbol}${formatPlainMoney(sale.grandTotal)}", cols)}\n".toByteArray(Charsets.UTF_8))
        out.write(byteArrayOf(0x1B, 0x45, 0x00))
        out.write("$sep\n".toByteArray(Charsets.UTF_8))

        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // Center
        out.write("${settings.receiptFooterNote}\n\n".toByteArray(Charsets.UTF_8))
        out.write("${settings.englishReturnPolicy}\n\n".toByteArray(Charsets.UTF_8))

        // Image-based ESC/POS raster fallback for crisp Bengali policy printing on any printer
        out.write(renderTextToEscPosRaster(settings.banglaReturnPolicy, settings.paperWidthMm))

        out.write(byteArrayOf(0x1B, 0x64, 0x04)) // Feed
        out.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // Cut
        return out.toByteArray()
    }

    /**
     * Renders Bangla Unicode text onto an Android Bitmap and converts it into
     * standard ESC/POS GS v 0 monochrome raster bytes for universal thermal printer support.
     */
    fun renderTextToEscPosRaster(text: String, paperWidthMm: Int): ByteArray {
        val widthPx = if (paperWidthMm >= 80) 576 else 384
        val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 22f
            typeface = Typeface.DEFAULT
        }
        val layout = StaticLayout.Builder
            .obtain(text, 0, text.length, textPaint, widthPx - 16)
            .setAlignment(Layout.Alignment.ALIGN_CENTER)
            .build()

        val heightPx = (layout.height + 16).coerceAtLeast(32)
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        canvas.translate(8f, 8f)
        layout.draw(canvas)

        val bytesPerRow = (widthPx + 7) / 8
        val out = ByteArrayOutputStream()
        // GS v 0 m xL xH yL yH d1...dk
        out.write(
            byteArrayOf(
                0x1D, 0x76, 0x30, 0x00,
                (bytesPerRow and 0xFF).toByte(), ((bytesPerRow shr 8) and 0xFF).toByte(),
                (heightPx and 0xFF).toByte(), ((heightPx shr 8) and 0xFF).toByte()
            )
        )

        for (y in 0 until heightPx) {
            for (xByte in 0 until bytesPerRow) {
                var slice = 0
                for (bit in 0 until 8) {
                    val x = xByte * 8 + bit
                    if (x < widthPx) {
                        val pixel = bitmap.getPixel(x, y)
                        val lum = (Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114)
                        if (lum < 140.0) {
                            slice = slice or (1 shl (7 - bit))
                        }
                    }
                }
                out.write(slice)
            }
        }
        bitmap.recycle()
        return out.toByteArray()
    }

    /**
     * Android System PrintManager fallback for PDF / Wi-Fi / Share printing.
     */
    fun printViaAndroidPrintManager(activityContext: Context, saleWithItems: SaleWithItems, settings: AppSettingsEntity) {
        val printManager = activityContext.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val lines = buildPlainReceiptLines(saleWithItems, settings)
        val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes?,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback?,
                extras: Bundle?
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback?.onLayoutCancelled()
                    return
                }
                val info = PrintDocumentInfo.Builder("Receipt_${saleWithItems.sale.billNumber}.pdf")
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(1)
                    .build()
                callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor?,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback?
            ) {
                val pdf = android.graphics.pdf.PdfDocument()
                val pageInfo = android.graphics.pdf.PdfDocument.PageInfo.Builder(300, 620, 1).create()
                val page = pdf.startPage(pageInfo)
                val paint = Paint().apply {
                    color = Color.BLACK
                    textSize = 10f
                    typeface = Typeface.MONOSPACE
                }
                var y = 24f
                lines.forEach { line ->
                    page.canvas.drawText(line, 12f, y, paint)
                    y += 14f
                }
                pdf.finishPage(page)
                try {
                    destination?.let { pfd ->
                        FileOutputStream(pfd.fileDescriptor).use { pdf.writeTo(it) }
                    }
                    callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                } catch (e: Exception) {
                    callback?.onWriteFailed(e.message)
                } finally {
                    pdf.close()
                }
            }
        }
        printManager.print("BazarPOS_${saleWithItems.sale.billNumber}", adapter, null)
    }

    fun buildPlainReceiptLines(saleWithItems: SaleWithItems, settings: AppSettingsEntity): List<String> {
        val cols = if (settings.paperWidthMm >= 80) 44 else 32
        val sep = "-".repeat(cols)
        val sale = saleWithItems.sale
        val lines = mutableListOf<String>()
        lines += settings.storeName
        lines += settings.storeAddress
        lines += "Tel: ${settings.storePhone}"
        lines += sep
        lines += "Bill: ${sale.billNumber}"
        lines += "Date: ${DhakaTime.formatDateTime(sale.createdAt)}"
        if (sale.customerName.isNotBlank() || sale.customerMobile.isNotBlank()) {
            lines += "Customer: ${sale.customerName} ${sale.customerMobile}"
        }
        lines += sep
        saleWithItems.items.forEach { item ->
            lines += item.productName
            lines += padColumns(" ${trimQty(item.quantity)} x ${formatPlainMoney(item.unitPrice)}", formatPlainMoney(item.subtotal), cols)
        }
        lines += sep
        lines += padColumns("Total Qty:", trimQty(sale.totalQuantity), cols)
        lines += padColumns("Subtotal:", "${settings.currencySymbol}${formatPlainMoney(sale.subtotal)}", cols)
        if (sale.discountAmount > 0.0) {
            lines += padColumns("Discount:", "-${settings.currencySymbol}${formatPlainMoney(sale.discountAmount)}", cols)
        }
        lines += padColumns("GRAND TOTAL:", "${settings.currencySymbol}${formatPlainMoney(sale.grandTotal)}", cols)
        lines += sep
        lines += settings.receiptFooterNote
        lines += settings.englishReturnPolicy
        lines += settings.banglaReturnPolicy
        return lines
    }

    private fun padColumns(left: String, right: String, totalCols: Int): String {
        val spaces = (totalCols - left.length - right.length).coerceAtLeast(1)
        return left + " ".repeat(spaces) + right
    }

    private fun formatPlainMoney(v: Double): String = String.format(java.util.Locale.US, "%.2f", v)

    private fun trimQty(q: Double): String = if (q % 1.0 == 0.0) q.toInt().toString() else q.toString()
}

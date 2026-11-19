package com.bazarpos.retail.domain

import android.view.InputDevice
import android.view.KeyEvent
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

enum class ScanSource {
    CAMERA_MLKIT,
    USB_OTG_HID,
    BLUETOOTH_HID,
    MANUAL_ENTRY
}

data class BarcodeScanEvent(
    val code: String,
    val source: ScanSource,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Unified barcode ingestion pipeline for:
 * 1) CameraX + ML Kit (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code)
 * 2) USB OTG HID hardware scanners
 * 3) Bluetooth HID hardware scanners
 * 4) Manual keyboard entry
 */
class UnifiedBarcodeProcessor {
    private val _scans = MutableSharedFlow<BarcodeScanEvent>(extraBufferCapacity = 32)
    val scans: SharedFlow<BarcodeScanEvent> = _scans.asSharedFlow()

    private val hidBuffer = StringBuilder()
    private var lastKeyTimestamp = 0L
    private var lastEmittedCode = ""
    private var lastEmittedAt = 0L

    fun submitCameraScan(rawValue: String) {
        emitNormalized(rawValue, ScanSource.CAMERA_MLKIT, debounceMs = 1100L)
    }

    fun submitManualScan(rawValue: String) {
        emitNormalized(rawValue, ScanSource.MANUAL_ENTRY, debounceMs = 150L)
    }

    /**
     * Intercepts Activity.dispatchKeyEvent for external USB OTG or Bluetooth HID scanners.
     * Hardware scanners emit rapid keystrokes ending with Enter/Tab.
     */
    fun handleHardwareKeyEvent(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return false
        val device = event.device ?: return false

        // Ignore soft virtual keyboard events
        if (device.isVirtual || event.deviceId <= 0) return false

        val isExternalHid = !device.isVirtual &&
            (device.sources and InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD

        if (!isExternalHid) return false

        val now = System.currentTimeMillis()
        if (now - lastKeyTimestamp > 350L) {
            hidBuffer.clear()
        }
        lastKeyTimestamp = now

        if (event.keyCode == KeyEvent.KEYCODE_ENTER || event.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || event.keyCode == KeyEvent.KEYCODE_TAB) {
            val captured = hidBuffer.toString().trim()
            hidBuffer.clear()
            if (captured.length >= 3) {
                val source = if (isBluetoothInputDevice(device)) ScanSource.BLUETOOTH_HID else ScanSource.USB_OTG_HID
                emitNormalized(captured, source, debounceMs = 200L)
                return true
            }
            return false
        }

        val unicodeChar = event.unicodeChar
        if (unicodeChar > 0) {
            val ch = unicodeChar.toChar()
            if (!ch.isISOControl()) {
                hidBuffer.append(ch)
            }
        }
        return false
    }

    private fun isBluetoothInputDevice(device: InputDevice): Boolean {
        val desc = (device.name ?: "") + " " + (device.descriptor ?: "")
        return desc.contains("bluetooth", ignoreCase = true) || desc.contains("bt", ignoreCase = true)
    }

    private fun emitNormalized(raw: String, source: ScanSource, debounceMs: Long) {
        val cleaned = raw.trim()
        if (cleaned.isEmpty()) return
        val now = System.currentTimeMillis()
        if (cleaned == lastEmittedCode && (now - lastEmittedAt) < debounceMs) {
            return
        }
        lastEmittedCode = cleaned
        lastEmittedAt = now
        _scans.tryEmit(BarcodeScanEvent(code = cleaned, source = source, timestamp = now))
    }
}

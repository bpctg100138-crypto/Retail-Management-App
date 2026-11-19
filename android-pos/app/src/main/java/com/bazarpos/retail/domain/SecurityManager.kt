package com.bazarpos.retail.domain

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

enum class ProtectedAction(val title: String) {
    REMOVE_CART_ITEM("Remove Product from Bill"),
    REDUCE_CART_QTY("Reduce Scanned Quantity"),
    CANCEL_BILL("Cancel Entire Bill"),
    CLEAR_CART("Clear POS Cart"),
    APPLY_DISCOUNT("Apply Discount"),
    OVERRIDE_STOCK("Sell Above Available Stock"),
    PRODUCT_SENSITIVE("Modify / Delete Product"),
    VENDOR_SENSITIVE("Modify / Delete Vendor"),
    CATEGORY_SENSITIVE("Modify / Delete Category"),
    STOCK_ADJUSTMENT("Adjust Inventory Stock"),
    PROCESS_EXCHANGE("Process 3-Day Exchange"),
    RESTORE_BACKUP("Restore Database Backup"),
    SENSITIVE_REPORTS("Access Profit & Margin Reports")
}

object SecurityManager {
    private const val ITERATIONS = 12000
    private const val KEY_LENGTH_BITS = 256
    private const val SALT_BYTES = 16

    fun createPasswordHash(password: String): Pair<String, String> {
        val salt = ByteArray(SALT_BYTES)
        SecureRandom().nextBytes(salt)
        val hash = pbkdf2(password.toCharArray(), salt)
        return Pair(
            Base64.encodeToString(hash, Base64.NO_WRAP),
            Base64.encodeToString(salt, Base64.NO_WRAP)
        )
    }

    fun verifyPassword(password: String, storedHashB64: String, storedSaltB64: String): Boolean {
        if (storedHashB64.isBlank() || storedSaltB64.isBlank()) return false
        val salt = Base64.decode(storedSaltB64, Base64.NO_WRAP)
        val expectedHash = Base64.decode(storedHashB64, Base64.NO_WRAP)
        val candidateHash = pbkdf2(password.toCharArray(), salt)
        return MessageDigest.isEqual(expectedHash, candidateHash)
    }

    private fun pbkdf2(chars: CharArray, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(chars, salt, ITERATIONS, KEY_LENGTH_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return factory.generateSecret(spec).encoded
    }
}

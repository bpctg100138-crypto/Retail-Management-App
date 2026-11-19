package com.bazarpos.retail.domain

import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.roundToLong

object DhakaTime {
    val ZONE: ZoneId = ZoneId.of("Asia/Dhaka")
    private val DATE_KEY_FMT = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.US)
    private val DISPLAY_FMT = DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a", Locale.US)
    private val SHORT_DATE_FMT = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.US)

    fun todayDateKey(nowMillis: Long = System.currentTimeMillis()): String {
        return Instant.ofEpochMilli(nowMillis).atZone(ZONE).toLocalDate().format(DATE_KEY_FMT)
    }

    fun formatDateTime(millis: Long): String {
        return Instant.ofEpochMilli(millis).atZone(ZONE).format(DISPLAY_FMT)
    }

    fun formatDate(millis: Long): String {
        return Instant.ofEpochMilli(millis).atZone(ZONE).toLocalDate().format(SHORT_DATE_FMT)
    }

    fun startOfTodayMillis(nowMillis: Long = System.currentTimeMillis()): Long {
        val today = Instant.ofEpochMilli(nowMillis).atZone(ZONE).toLocalDate()
        return today.atStartOfDay(ZONE).toInstant().toEpochMilli()
    }

    fun endOfTodayMillis(nowMillis: Long = System.currentTimeMillis()): Long {
        val tomorrow = Instant.ofEpochMilli(nowMillis).atZone(ZONE).toLocalDate().plusDays(1)
        return tomorrow.atStartOfDay(ZONE).toInstant().toEpochMilli() - 1
    }

    fun startOfMonthMillis(nowMillis: Long = System.currentTimeMillis()): Long {
        val first = Instant.ofEpochMilli(nowMillis).atZone(ZONE).toLocalDate().withDayOfMonth(1)
        return first.atStartOfDay(ZONE).toInstant().toEpochMilli()
    }

    fun startOfYearMillis(nowMillis: Long = System.currentTimeMillis()): Long {
        val first = Instant.ofEpochMilli(nowMillis).atZone(ZONE).toLocalDate().withDayOfYear(1)
        return first.atStartOfDay(ZONE).toInstant().toEpochMilli()
    }
}

data class GpResult(
    val gpAmount: Double,
    val gpPercentage: Double
)

object GpCalculator {
    fun calculate(purchasePrice: Double, sellingPrice: Double): GpResult {
        val safePurchase = purchasePrice.coerceAtLeast(0.0)
        val safeSelling = sellingPrice.coerceAtLeast(0.0)
        val gpAmount = round2(safeSelling - safePurchase)
        val gpPercentage = if (safeSelling > 0.0) {
            round2((gpAmount / safeSelling) * 100.0)
        } else {
            0.0
        }
        return GpResult(gpAmount = gpAmount, gpPercentage = gpPercentage)
    }

    fun round2(value: Double): Double = (value * 100.0).roundToLong() / 100.0
}

object BillNumberGenerator {
    fun nextBillNumber(dateKey: String, latestBillNumberForDate: String?): String {
        val nextSerial = if (latestBillNumberForDate.isNullOrBlank()) {
            1
        } else {
            val parts = latestBillNumberForDate.split("-")
            val lastNum = parts.getOrNull(1)?.toIntOrNull() ?: 0
            lastNum + 1
        }
        return "$dateKey-${nextSerial.toString().padStart(3, '0')}"
    }

    fun nextCode(prefix: String, maxId: Long?, padWidth: Int = 4): String {
        val next = (maxId ?: 0L) + 1L
        return "$prefix-${next.toString().padStart(padWidth, '0')}"
    }
}

object ExchangePolicy {
    const val MAX_EXCHANGE_DAYS = 3L

    fun isEligibleForExchange(saleCreatedAtMillis: Long, nowMillis: Long = System.currentTimeMillis()): Boolean {
        val saleDate: LocalDate = Instant.ofEpochMilli(saleCreatedAtMillis).atZone(DhakaTime.ZONE).toLocalDate()
        val currentDate: LocalDate = Instant.ofEpochMilli(nowMillis).atZone(DhakaTime.ZONE).toLocalDate()
        val daysBetween = ChronoUnit.DAYS.between(saleDate, currentDate)
        return daysBetween in 0..MAX_EXCHANGE_DAYS
    }
}

object CurrencyFormatter {
    fun format(amount: Double, symbol: String = "৳"): String {
        val nf = NumberFormat.getNumberInstance(Locale("en", "BD")).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }
        return "$symbol${nf.format(amount)}"
    }
}

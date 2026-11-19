package com.bazarpos.retail

import com.bazarpos.retail.domain.BillNumberGenerator
import com.bazarpos.retail.domain.ExchangePolicy
import com.bazarpos.retail.domain.GpCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PosDomainTest {
    @Test
    fun gpCalculation_handlesNormalAndZeroSellingPrice() {
        val normal = GpCalculator.calculate(purchasePrice = 120.0, sellingPrice = 150.0)
        assertEquals(30.0, normal.gpAmount, 0.001)
        assertEquals(20.0, normal.gpPercentage, 0.001)

        val zeroSelling = GpCalculator.calculate(purchasePrice = 50.0, sellingPrice = 0.0)
        assertEquals(-50.0, zeroSelling.gpAmount, 0.001)
        assertEquals(0.0, zeroSelling.gpPercentage, 0.001)
    }

    @Test
    fun billNumberGenerator_resetsDailyAndIncrements() {
        assertEquals("20261119-001", BillNumberGenerator.nextBillNumber("20261119", null))
        assertEquals("20261119-002", BillNumberGenerator.nextBillNumber("20261119", "20261119-001"))
        assertEquals("20261120-001", BillNumberGenerator.nextBillNumber("20261120", null))
    }

    @Test
    fun exchangeEligibility_enforcesThreeDayRule() {
        val now = 1795080000000L // Reference timestamp
        val twoDaysAgo = now - (2L * 24 * 60 * 60 * 1000)
        val fourDaysAgo = now - (4L * 24 * 60 * 60 * 1000)
        assertTrue(ExchangePolicy.isEligibleForExchange(twoDaysAgo, now))
        assertFalse(ExchangePolicy.isEligibleForExchange(fourDaysAgo, now))
    }
}

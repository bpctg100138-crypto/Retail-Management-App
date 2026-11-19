package com.bazarpos.retail

import android.app.Application
import com.bazarpos.retail.data.local.PosDatabase
import com.bazarpos.retail.data.repository.PosRepository
import com.bazarpos.retail.domain.EscPosPrinterManager
import com.bazarpos.retail.domain.UnifiedBarcodeProcessor

class BazarPosApplication : Application() {
    val database: PosDatabase by lazy { PosDatabase.getInstance(this) }
    val repository: PosRepository by lazy { PosRepository(database) }
    val barcodeProcessor: UnifiedBarcodeProcessor by lazy { UnifiedBarcodeProcessor() }
    val printerManager: EscPosPrinterManager by lazy { EscPosPrinterManager(this) }
}

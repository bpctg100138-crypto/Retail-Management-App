# BazarPOS — Offline-First Retail Management & POS Android Application

A complete, offline-first Retail Management & Point of Sale (POS) Android application built in **Kotlin**, **Jetpack Compose (Material 3)**, and **Room SQLite**, tailored for retail shops in Bangladesh (`Asia/Dhaka` timezone, `৳ BDT`, English & বাংলা bilingual UI and thermal receipts).

## Core Architecture

- **UI**: Jetpack Compose + Material 3 (`Light` & `Dark` themes, English & Bangla resources)
- **State Management**: MVVM + `StateFlow` / `SharedFlow`
- **Persistence**: Room SQLite (`PosDatabase`) with 12 relational tables, foreign keys, unique constraints (`barcode`, `billNumber`, `mobile`), and `@Transaction` atomic checkout/exchange/stock operations.
- **Offline Security**: First-launch Administrator Password setup using `PBKDF2WithHmacSHA256` with random 16-byte salt, configurable authorization rules, and immutable `AuditLogEntity` records.
- **Unified Barcode Pipeline**:
  1. Mobile Camera via **CameraX + Google ML Kit** (offline model, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR Code)
  2. **USB OTG HID** external scanners (intercepted via `Activity.dispatchKeyEvent`)
  3. **Bluetooth HID** scanners (intercepted via `Activity.dispatchKeyEvent`)
- **Thermal Printing**: Universal Bluetooth Classic SPP (`00001101-0000-1000-8000-00805F9B34FB`) ESC/POS printing for **58mm** & **80mm** printers, including **bitmap raster fallback (`GS v 0`)** for crisp Bengali return policy printing on printers without built-in Bangla codepages, plus Android `PrintManager` PDF fallback.
- **Backup & Restore**: Offline SQLite backup and restore via Android Storage Access Framework (SAF), plus UTF-8 BOM CSV exports for products, vendors, sales, and reports.

## Bill Numbering & Exchange Rules

- Bill numbers follow `YYYYMMDD-001` in `Asia/Dhaka` timezone and reset daily while remaining unique across restarts.
- Return & Exchange Policy (printed in English & Bangla on every receipt):
  - *"Products may be exchanged within 3 days of purchase with the original bill. No cash refund is available."*
  - *"ক্রয়ের ৩ দিনের মধ্যে মূল বিলসহ পণ্য এক্সচেঞ্জ করা যাবে। কোনো নগদ টাকা ফেরত দেওয়া হবে না।"*

## Building the APK (Android Studio / GitHub Codespaces)

1. Open the `android-pos` folder in **Android Studio Ladybug (2024.2+)** or a Linux Codespace with JDK 17 + Android SDK 35.
2. Ensure `gradle/wrapper/gradle-wrapper.jar` is present (if missing, run `gradle wrapper --gradle-version 8.9` or let Android Studio sync download it automatically).
3. Build the debug APK:
   ```bash
   chmod +x gradlew
   ./gradlew assembleDebug
   ```
4. Output APK path:
   ```text
   app/build/outputs/apk/debug/app-debug.apk
   ```

## Uploading to GitHub

```bash
cd android-pos
git init
git add .
git commit -m "Initial BazarPOS Android Studio project"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Environment & Hardware Verification Notice

- This web container does not include JDK/Android SDK or physical Bluetooth/USB POS hardware, so `./gradlew assembleDebug` and physical hardware scans/prints have **not** been executed in this container.
- All pure retail domain math (GP%, daily bill numbering, 3-day exchange eligibility, stock deduction, cart totals, report aggregation, and receipt formatting) is verified in the companion TypeScript test suite and interactive web simulator.

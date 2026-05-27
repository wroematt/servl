package com.servl.app.ble

import android.Manifest
import android.os.Build

/**
 * Returns the set of permissions required for BLE scanning and connecting on the current
 * Android version.
 *
 * Android 12+ (API 31) replaced the old BLUETOOTH/BLUETOOTH_ADMIN + ACCESS_FINE_LOCATION
 * bundle with the new granular BLUETOOTH_SCAN / BLUETOOTH_CONNECT permissions.
 */
object BlePermissions {
    fun required(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            )
        } else {
            arrayOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION,
            )
        }
}

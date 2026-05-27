package com.servl.app.ble

import java.util.UUID

/**
 * Custom GATT service and characteristic UUIDs for the Servl provisioning protocol.
 *
 * The ESP32 firmware must advertise PROVISION_SERVICE and expose these characteristics.
 * Writes to characteristics must be completed in order; do not pipeline BLE writes.
 */
object ServlGattUuids {
    /** Custom provisioning service — ESP32 advertises this UUID in provisioning mode. */
    val PROVISION_SERVICE    : UUID = UUID.fromString("0000FE00-5345-524C-0000-534552564C31")

    /** Write the WiFi SSID as UTF-8 bytes. */
    val WIFI_SSID_CHAR       : UUID = UUID.fromString("0000FE01-5345-524C-0000-534552564C31")

    /** Write the WiFi password as UTF-8 bytes. */
    val WIFI_PASSWORD_CHAR   : UUID = UUID.fromString("0000FE02-5345-524C-0000-534552564C31")

    /**
     * Write MQTT configuration as UTF-8 JSON:
     * { "broker": "host", "port": 8883, "client_id": "device_xxx", "user": "u", "pass": "p" }
     */
    val MQTT_CONFIG_CHAR     : UUID = UUID.fromString("0000FE03-5345-524C-0000-534552564C31")

    /** Write 0x01 to trigger the ESP32 to connect to WiFi + MQTT and leave provisioning mode. */
    val COMMIT_CHAR          : UUID = UUID.fromString("0000FE04-5345-524C-0000-534552564C31")

    /** Notify characteristic — ESP32 writes "OK" or "ERROR:reason" after commit. */
    val STATUS_NOTIFY_CHAR   : UUID = UUID.fromString("0000FE05-5345-524C-0000-534552564C31")

    /** Standard CCCD UUID — must be written to enable notifications on STATUS_NOTIFY_CHAR. */
    val CCCD                 : UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
}

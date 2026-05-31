package com.servl.app.data.network.dto

data class DeviceDto(
    val id: String,
    val household_id: String,
    val name: String,
    val serial_number: String,
    val mqtt_client_id: String,
    val cert_fingerprint: String?,
    val hopper_pct: Int,
    val firmware_version: String?,
    val status: String,             // "online" | "offline" | "error"
    val last_seen_at: String?,
    val created_at: String,
    val events: List<DeviceEventDto>?,
    // Only present in the POST /devices (provision) response — never stored on the device.
    val mqtt_user: String? = null,
    val mqtt_pass: String? = null,
)

data class DeviceEventDto(
    val id: String,
    val device_id: String,
    val event_type: String,         // "error" | "hopper_low" | "hopper_refilled" | "firmware_update" | "reconnect"
    val payload: Map<String, Any>?,
    val created_at: String,
)

data class DeviceEventsResponse(
    val data: List<DeviceEventDto>,
    val total: Int,
    val page: Int,
    val page_size: Int,
)

data class ProvisionDeviceRequest(
    val name: String,
    val serial_number: String,
)

data class UpdateDeviceRequest(val name: String)

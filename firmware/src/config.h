#pragma once
#include <Arduino.h>    // uint8_t, uint32_t, etc. from the ESP32 toolchain

// ─── Hardware pins ───────────────────────────────────────────────────────────
// GPIO2  = built-in LED on most ESP32-WROOM / ESP32 DevKit boards (active HIGH)
// GPIO0  = BOOT button (active LOW)
constexpr uint8_t PIN_LED    = 2;
constexpr uint8_t PIN_BUTTON = 0;

// ─── Timing ──────────────────────────────────────────────────────────────────
// How long to hold the BOOT button to erase credentials and reboot into
// provisioning mode.
constexpr uint32_t RESET_HOLD_MS = 3000;

// How often the device publishes a heartbeat status message while operational.
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 30000;

// LED pulse duration per gram during a simulated dispense.
constexpr uint32_t FLASH_ON_MS  = 100;
constexpr uint32_t FLASH_OFF_MS = 100;

// WiFi and MQTT connection timeouts during provisioning commit test.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MQTT_CONNECT_TIMEOUT_MS =  8000;

// ─── MQTT ────────────────────────────────────────────────────────────────────
// Must be large enough for the largest inbound command JSON (~150 bytes) plus
// PubSubClient header overhead.  Defined here; mqtt_conn.cpp sets it before
// including PubSubClient.h.
constexpr int MQTT_MAX_PACKET = 512;

// ─── Firmware identity ───────────────────────────────────────────────────────
constexpr char FIRMWARE_VERSION[] = "1.0.0";

// BLE device name prefix — last 4 hex digits of MAC are appended at runtime
// so multiple units can be distinguished (e.g. "Servl-A1B2").
constexpr char BLE_NAME_PREFIX[] = "Servl-";

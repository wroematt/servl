#pragma once
#include <Arduino.h>

// ─── LED states ──────────────────────────────────────────────────────────────
enum class LedState {
    OFF,              // LED off (e.g. dispensing is controlling the LED directly)
    PROVISIONING,     // 500 ms on / 500 ms off  — waiting for BLE provisioning
    WIFI_CONNECTING,  // 100 ms on / 100 ms off  — connecting to WiFi
    MQTT_CONNECTING,  // 200 ms on / 200 ms off  — connecting to MQTT
    OPERATIONAL,      // brief 50 ms flash every 5 s — all good
};

// Set the desired blink pattern.
void led_status_set(LedState state);

// Drive the LED according to the current pattern using millis().
// Must be called on every loop() iteration.
void led_status_update();

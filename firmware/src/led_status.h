#pragma once
#include <Arduino.h>

// ─── LED states ──────────────────────────────────────────────────────────────
enum class LedState {
    OFF,              // LED off — nothing is driving it
    PROVISIONING,     // 500 ms on / 500 ms off  — waiting for BLE provisioning
    WIFI_CONNECTING,  // 100 ms on / 100 ms off  — connecting to WiFi
    MQTT_CONNECTING,  // 200 ms on / 200 ms off  — connecting to MQTT
    OPERATIONAL,      // brief 50 ms flash every 5 s — all good
    DISPENSING,       // fast DISPENSE_BLINK_*_MS blink — auger motor running.
                      // Purely a "busy" indicator now; the motor (not the
                      // LED) does the actual dispensing work.
};

// Set the desired blink pattern.
void led_status_set(LedState state);

// Drive the LED according to the current pattern using millis().
// Must be called on every loop() iteration.
void led_status_update();

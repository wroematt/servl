#include <Arduino.h>
#include "config.h"
#include "storage.h"
#include "ble_provision.h"
#include "wifi_conn.h"
#include "mqtt_conn.h"
#include "dispenser.h"
#include "led_status.h"

// ─── Application states ───────────────────────────────────────────────────────
enum class AppState {
    PROVISIONING_BLE,   // No credentials in NVS — BLE GATT server active
    WIFI_CONNECTING,    // Credentials found/received — connecting to WiFi
    MQTT_CONNECTING,    // WiFi up — connecting to MQTT broker
    OPERATIONAL,        // MQTT connected — listening for commands
    DISPENSING,         // Executing a dispense command
};

static AppState      s_state       = AppState::PROVISIONING_BLE;
static Credentials   s_creds       = {};
static uint32_t      s_heartbeatAt = 0;
static uint32_t      s_btnPressAt  = 0;

// ─── Forward declarations ─────────────────────────────────────────────────────
static void handle_provisioning_ble();
static void handle_wifi_connecting();
static void handle_mqtt_connecting();
static void handle_operational();
static void handle_dispensing();
static void check_factory_reset();

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);  // give the monitor a moment to attach

    pinMode(PIN_LED,    OUTPUT);
    pinMode(PIN_BUTTON, INPUT_PULLUP);   // BOOT button is active LOW
    digitalWrite(PIN_LED, LOW);

    dispenser_reset_hopper();

    log_i("[main] Servl firmware v%s booting...", FIRMWARE_VERSION);

    if (storage_has_credentials()) {
        log_i("[main] Credentials found in NVS — going to WiFi_CONNECTING");
        s_creds = storage_load();
        s_state = AppState::WIFI_CONNECTING;
        led_status_set(LedState::WIFI_CONNECTING);
    } else {
        log_i("[main] No credentials — starting BLE provisioning");
        s_state = AppState::PROVISIONING_BLE;
        led_status_set(LedState::PROVISIONING);
        ble_provision_start();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
void loop() {
    check_factory_reset();
    led_status_update();

    switch (s_state) {
        case AppState::PROVISIONING_BLE: handle_provisioning_ble(); break;
        case AppState::WIFI_CONNECTING:  handle_wifi_connecting();  break;
        case AppState::MQTT_CONNECTING:  handle_mqtt_connecting();  break;
        case AppState::OPERATIONAL:      handle_operational();      break;
        case AppState::DISPENSING:       handle_dispensing();       break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory reset: hold BOOT button for RESET_HOLD_MS
// ─────────────────────────────────────────────────────────────────────────────
static void check_factory_reset() {
    if (digitalRead(PIN_BUTTON) == LOW) {
        if (s_btnPressAt == 0) s_btnPressAt = millis();
        if (millis() - s_btnPressAt >= RESET_HOLD_MS) {
            log_w("[main] Factory reset triggered — erasing credentials and rebooting");
            // Flash LED rapidly 5× to give visible feedback
            for (int i = 0; i < 5; i++) {
                digitalWrite(PIN_LED, HIGH); delay(100);
                digitalWrite(PIN_LED, LOW);  delay(100);
            }
            storage_clear();
            esp_restart();
        }
    } else {
        s_btnPressAt = 0;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: PROVISIONING_BLE
// BLE server is active; wait for commit, then test credentials.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_provisioning_ble() {
    if (!ble_provision_commit_pending()) return;

    // Clear immediately so a failed test doesn't spin-loop and so the Android
    // app can write a corrected commit if the first attempt fails.
    ble_provision_clear_commit();

    log_i("[main] PROVISIONING: commit received — testing credentials");
    s_creds = ble_provision_get_credentials();

    // Test WiFi (BLE + WiFi coexist on ESP32 with NimBLE).
    bool wifiOk = wifi_connect(s_creds.ssid, s_creds.wifi_pass, WIFI_CONNECT_TIMEOUT_MS);
    if (!wifiOk) {
        log_e("[main] PROVISIONING: WiFi test failed");
        ble_provision_notify_result("ERROR:wifi");
        return;   // stay in PROVISIONING_BLE; Android app shows the error
    }

    // Test MQTT
    bool mqttOk = mqtt_connect(s_creds);
    if (!mqttOk) {
        log_e("[main] PROVISIONING: MQTT test failed");
        WiFi.disconnect(true);
        ble_provision_notify_result("ERROR:mqtt");
        return;   // stay in PROVISIONING_BLE
    }

    // Both OK — persist credentials, notify the app, reboot into operational mode.
    storage_save(s_creds);
    ble_provision_notify_result("OK");

    log_i("[main] PROVISIONING: success — rebooting in 1 s");
    delay(1000);   // give the notification time to reach the app
    ble_provision_stop();
    esp_restart();
}

// ─────────────────────────────────────────────────────────────────────────────
// State: WIFI_CONNECTING
// Attempt WiFi; on success advance to MQTT_CONNECTING.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_wifi_connecting() {
    if (wifi_connect(s_creds.ssid, s_creds.wifi_pass, WIFI_CONNECT_TIMEOUT_MS)) {
        log_i("[main] WiFi connected — moving to MQTT_CONNECTING");
        s_state = AppState::MQTT_CONNECTING;
        led_status_set(LedState::MQTT_CONNECTING);
    } else {
        log_w("[main] WiFi connect failed — will retry");
        delay(5000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: MQTT_CONNECTING
// Attempt MQTT; on success advance to OPERATIONAL.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_mqtt_connecting() {
    if (mqtt_connect(s_creds)) {
        log_i("[main] MQTT connected — moving to OPERATIONAL");

        // Publish initial heartbeat (hopper_pct is 100 on fresh boot; or whatever
        // was last reduced before a previous power-cycle — virtual only, resets to 100).
        mqtt_publish_status(nullptr, -1, dispenser_get_hopper_pct(), "ok");
        s_heartbeatAt = millis() + HEARTBEAT_INTERVAL_MS;

        s_state = AppState::OPERATIONAL;
        led_status_set(LedState::OPERATIONAL);
    } else {
        log_w("[main] MQTT connect failed — checking WiFi, will retry");
        // If WiFi dropped, go back to WIFI_CONNECTING.
        if (!wifi_is_connected()) {
            s_state = AppState::WIFI_CONNECTING;
            led_status_set(LedState::WIFI_CONNECTING);
        }
        delay(5000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: OPERATIONAL
// Maintain connections, send heartbeats, check for pending commands.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_operational() {
    // Maintain network connections.
    wifi_maintain();
    if (!wifi_is_connected()) {
        log_w("[main] WiFi lost — returning to WIFI_CONNECTING");
        s_state = AppState::WIFI_CONNECTING;
        led_status_set(LedState::WIFI_CONNECTING);
        return;
    }

    if (!mqtt_is_connected()) {
        log_w("[main] MQTT disconnected — returning to MQTT_CONNECTING");
        s_state = AppState::MQTT_CONNECTING;
        led_status_set(LedState::MQTT_CONNECTING);
        return;
    }

    mqtt_loop();  // process incoming messages + keepalive

    // Periodic heartbeat
    if (millis() >= s_heartbeatAt) {
        mqtt_publish_status(nullptr, -1, dispenser_get_hopper_pct(), "ok");
        s_heartbeatAt = millis() + HEARTBEAT_INTERVAL_MS;
    }

    // Check for a pending dispense command (set by the MQTT message callback).
    if (g_commandPending) {
        log_i("[main] Dispense command received — moving to DISPENSING");
        s_state = AppState::DISPENSING;
        led_status_set(LedState::OFF);  // dispenser_run() controls the LED
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: DISPENSING
// Simulate the dispense, then publish confirmation and return to OPERATIONAL.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_dispensing() {
    // Capture the command before clearing the flag.
    PendingCommand cmd = g_pendingCommand;
    g_commandPending = false;

    log_i("[main] DISPENSING %dg  command_id: %s", cmd.weight_g, cmd.command_id);

    // dispenser_run() flashes the LED and calls mqtt_loop() per gram.
    dispenser_run(cmd.weight_g);

    int hopper = dispenser_get_hopper_pct();

    // Publish confirmation.
    mqtt_publish_status(cmd.command_id, cmd.weight_g, hopper, "ok");

    // If hopper just went below 20%, send an explicit low_hopper notification.
    if (hopper < 20) {
        log_w("[main] Hopper low: %d%%", hopper);
        mqtt_publish_status(nullptr, -1, hopper, "low_hopper");
    }

    log_i("[main] Dispense done — returning to OPERATIONAL");
    s_state = AppState::OPERATIONAL;
    led_status_set(LedState::OPERATIONAL);
}

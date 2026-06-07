#include <Arduino.h>
#include <WiFi.h>       // WiFi.disconnect() in handle_provisioning_ble()
#include <HTTPClient.h>
#include <Update.h>
#include "config.h"
#include "storage.h"
#include "ble_provision.h"
#include "wifi_conn.h"
#include "mqtt_conn.h"
#include "dispenser.h"
#include "stepper.h"
#include "scale.h"
#include "led_status.h"

// ─── Application states ───────────────────────────────────────────────────────
enum class AppState {
    PROVISIONING_BLE,   // No credentials in NVS — BLE GATT server active
    WIFI_CONNECTING,    // Credentials found/received — connecting to WiFi
    MQTT_CONNECTING,    // WiFi up — connecting to MQTT broker
    OPERATIONAL,        // MQTT connected — listening for commands
    DISPENSING,         // Executing a dispense command
    UPDATING,           // Downloading + flashing OTA firmware update
};

static AppState      s_state          = AppState::PROVISIONING_BLE;
static Credentials   s_creds          = {};
static uint32_t      s_heartbeatAt    = 0;
static uint32_t      s_btnPressAt     = 0;
static bool          s_calibrateFired = false;   // guards the recalibration hold-tier firing more than once per press

// ─── Forward declarations ─────────────────────────────────────────────────────
static void handle_provisioning_ble();
static void handle_wifi_connecting();
static void handle_mqtt_connecting();
static void handle_operational();
static void handle_dispensing();
static void handle_updating();
static void check_factory_reset();

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);  // give the monitor a moment to attach

    pinMode(PIN_LED,    OUTPUT);
    pinMode(PIN_BUTTON, INPUT_PULLUP);   // BOOT button is active LOW
    digitalWrite(PIN_LED, LOW);

    stepper_init();
    scale_init();
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
        case AppState::UPDATING:         handle_updating();         break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT button hold gestures — two tiers (see CALIBRATE_HOLD_MS / RESET_HOLD_MS
// in config.h):
//   short hold  → recalibrate the empty-hopper scale baseline (hopper MUST be
//                 empty — see scale_recalibrate_empty())
//   long hold   → factory reset: erase credentials, reboot into provisioning
// ─────────────────────────────────────────────────────────────────────────────
static void check_factory_reset() {
    if (digitalRead(PIN_BUTTON) == LOW) {
        if (s_btnPressAt == 0) {
            s_btnPressAt     = millis();
            s_calibrateFired = false;
        }
        uint32_t held = millis() - s_btnPressAt;

        // Tier 1: empty-hopper recalibration. Fires once per press — guarded
        // so it doesn't repeat on every loop() iteration while held past this
        // threshold, and so it stays a one-shot even if the hold continues on
        // into factory-reset territory.
        if (!s_calibrateFired && held >= CALIBRATE_HOLD_MS && held < RESET_HOLD_MS) {
            s_calibrateFired = true;
            log_w("[main] Empty-hopper recalibration triggered (BOOT held %lu ms)", (unsigned long)held);
            // Two short flashes = "calibrating" — visually distinct from the
            // five-flash factory-reset confirmation below.
            for (int i = 0; i < 2; i++) {
                digitalWrite(PIN_LED, HIGH); delay(150);
                digitalWrite(PIN_LED, LOW);  delay(150);
            }
            scale_recalibrate_empty();
            dispenser_reset_hopper();   // refresh the %-full estimate against the new baseline
        }

        // Tier 2: factory reset (existing behaviour, unchanged threshold).
        if (held >= RESET_HOLD_MS) {
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
        s_btnPressAt     = 0;
        s_calibrateFired = false;
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
    bool wifiOk = wifi_connect(s_creds.ssid, s_creds.wifi_pass, WIFI_CONNECT_TIMEOUT_MS, led_status_update);
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

    // Best-effort BLE indication.  The ESP32 shares its 2.4 GHz radio between
    // WiFi and BLE; while WiFi is connected it starves BLE TX, so this
    // indication may or may not reach the Android app.  The app falls back to
    // polling the backend for confirmation, so a lost indication is not fatal.
    ble_provision_notify_result("OK");

    log_i("[main] PROVISIONING: success — rebooting in 1.5 s");
    delay(1500);
    esp_restart();
}

// ─────────────────────────────────────────────────────────────────────────────
// State: WIFI_CONNECTING
// Attempt WiFi; on success advance to MQTT_CONNECTING.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_wifi_connecting() {
    if (wifi_connect(s_creds.ssid, s_creds.wifi_pass, WIFI_CONNECT_TIMEOUT_MS, led_status_update)) {
        log_i("[main] WiFi connected — moving to MQTT_CONNECTING");
        s_state = AppState::MQTT_CONNECTING;
        led_status_set(LedState::MQTT_CONNECTING);
    } else {
        log_w("[main] WiFi connect failed — will retry");
        // Non-blocking 5 s back-off: keep updating the LED every 200 ms.
        uint32_t retryAt = millis() + 5000;
        while (millis() < retryAt) {
            led_status_update();
            delay(20);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: MQTT_CONNECTING
// Attempt MQTT; on success advance to OPERATIONAL.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_mqtt_connecting() {
    if (mqtt_connect(s_creds)) {
        log_i("[main] MQTT connected — moving to OPERATIONAL");

        // Publish initial heartbeat with a fresh hopper reading from the scale
        // (a real measurement now — see dispenser_reset_hopper() / scale.h).
        dispenser_reset_hopper();
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
        // Non-blocking 5 s back-off: keep updating the LED every 20 ms.
        uint32_t retryAt = millis() + 5000;
        while (millis() < retryAt) {
            led_status_update();
            delay(20);
        }
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

    // Periodic heartbeat — take a fresh scale reading first so hopper_pct
    // reflects reality even between dispenses (e.g. the user topping up the
    // hopper shows up within one heartbeat interval, not just after a feed).
    if (millis() >= s_heartbeatAt) {
        dispenser_reset_hopper();
        mqtt_publish_status(nullptr, -1, dispenser_get_hopper_pct(), "ok");
        s_heartbeatAt = millis() + HEARTBEAT_INTERVAL_MS;
    }

    // Check for a remote factory reset command (sent by the backend when the device is deleted).
    if (g_factoryResetPending) {
        log_w("[main] Remote factory reset — erasing credentials and rebooting");
        g_factoryResetPending = false;
        // Flash LED 5x to give visible feedback (mirrors physical button reset).
        for (int i = 0; i < 5; i++) {
            digitalWrite(PIN_LED, HIGH); delay(100);
            digitalWrite(PIN_LED, LOW);  delay(100);
        }
        storage_clear();
        esp_restart();
    }

    // Check for a pending OTA update command.
    if (g_otaPending) {
        log_i("[main] OTA command received — moving to UPDATING");
        s_state = AppState::UPDATING;
        led_status_set(LedState::WIFI_CONNECTING);  // fast blink during update
        return;
    }

    // Check for a pending dispense command (set by the MQTT message callback).
    if (g_commandPending) {
        log_i("[main] Dispense command received — moving to DISPENSING");
        s_state = AppState::DISPENSING;
        led_status_set(LedState::DISPENSING);  // fast blink — auger motor running
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// State: DISPENSING
// Drive the auger to dispense the requested weight, then publish confirmation
// and return to OPERATIONAL.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_dispensing() {
    // Capture the command before clearing the flag.
    PendingCommand cmd = g_pendingCommand;
    g_commandPending = false;

    log_i("[main] DISPENSING %dg  command_id: %s", cmd.weight_g, cmd.command_id);

    // dispenser_run() drives the stepper motor under closed-loop weight
    // feedback from the hopper scale (see scale.h / dispenser.cpp) and pumps
    // mqtt_loop() periodically to keep the connection alive during the rotation.
    dispenser_run(cmd.weight_g);

    int  hopper   = dispenser_get_hopper_pct();
    int  measured = dispenser_get_last_dispensed_g();
    bool ok       = dispenser_last_run_ok();

    // Report the *measured* amount — not the requested amount — so
    // feed_events.weight_dispensed_g reflects what the closed-loop scale
    // feedback actually observed (see CLAUDE.md MQTT confirmation-loop
    // rationale: this is precisely what surfaces a short dispense to the user).
    if (ok) {
        mqtt_publish_status(cmd.command_id, measured, hopper, "ok");
    } else {
        mqtt_publish_status(cmd.command_id, measured, hopper, "error",
                            "Dispense timed out before reaching the target weight "
                            "— check the hopper, auger, and scale calibration");
    }

    // If hopper just went below 20%, send an explicit low_hopper notification.
    if (hopper < 20) {
        log_w("[main] Hopper low: %d%%", hopper);
        mqtt_publish_status(nullptr, -1, hopper, "low_hopper");
    }

    log_i("[main] Dispense done — returning to OPERATIONAL");
    s_state = AppState::OPERATIONAL;
    led_status_set(LedState::OPERATIONAL);
}

// ─────────────────────────────────────────────────────────────────────────────
// State: UPDATING
// Download firmware binary via HTTP and flash using the Arduino Update library.
// On success: publishes ota_ok status then reboots into the new firmware.
// On failure: logs error, publishes ota_failed, returns to OPERATIONAL.
// ─────────────────────────────────────────────────────────────────────────────
static void handle_updating() {
    OtaCommand cmd = g_otaCommand;
    g_otaPending = false;

    log_i("[ota] Starting OTA update to v%s", cmd.version);
    log_i("[ota] Download URL: %s", cmd.url);

    HTTPClient http;
    http.begin(cmd.url);
    http.setTimeout(30000);  // 30 s download timeout
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        log_e("[ota] HTTP GET failed: %d", httpCode);
        http.end();
        mqtt_publish_status(cmd.command_id, -1, dispenser_get_hopper_pct(), "ota_failed");
        s_state = AppState::OPERATIONAL;
        led_status_set(LedState::OPERATIONAL);
        return;
    }

    int contentLen = http.getSize();
    log_i("[ota] Content-Length: %d bytes", contentLen);

    bool canBegin = Update.begin(contentLen > 0 ? contentLen : UPDATE_SIZE_UNKNOWN);
    if (!canBegin) {
        log_e("[ota] Update.begin() failed — not enough flash space?");
        http.end();
        mqtt_publish_status(cmd.command_id, -1, dispenser_get_hopper_pct(), "ota_failed");
        s_state = AppState::OPERATIONAL;
        led_status_set(LedState::OPERATIONAL);
        return;
    }

    // Stream the download into the flash partition.
    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    http.end();

    log_i("[ota] Written %d bytes", written);

    if (!Update.end()) {
        log_e("[ota] Update.end() failed: %s", Update.errorString());
        mqtt_publish_status(cmd.command_id, -1, dispenser_get_hopper_pct(), "ota_failed");
        s_state = AppState::OPERATIONAL;
        led_status_set(LedState::OPERATIONAL);
        return;
    }

    if (!Update.isFinished()) {
        log_e("[ota] Update not finished — incomplete download");
        mqtt_publish_status(cmd.command_id, -1, dispenser_get_hopper_pct(), "ota_failed");
        s_state = AppState::OPERATIONAL;
        led_status_set(LedState::OPERATIONAL);
        return;
    }

    log_i("[ota] Flash successful — publishing ota_ok and rebooting in 1 s");
    mqtt_publish_status(cmd.command_id, -1, dispenser_get_hopper_pct(), "ota_ok");
    delay(1000);  // give MQTT time to deliver the status before reset
    esp_restart();
}

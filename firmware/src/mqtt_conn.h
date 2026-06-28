#pragma once
#include <Arduino.h>
#include "storage.h"

// ─── Pending command ──────────────────────────────────────────────────────────
// Populated by the MQTT message callback when a dispense command arrives.
struct PendingCommand {
    char command_id[64];
    int  weight_g;
};

// ─── Pending OTA command ──────────────────────────────────────────────────────
// Populated by the MQTT message callback when an OTA update command arrives.
struct OtaCommand {
    char command_id[64];
    char url[512];       // full HTTP URL including signed token query parameter
    char version[16];    // semver string, e.g. "1.3.0"
};

// Set by the message callback; cleared by main.cpp after the command is handled.
extern volatile bool  g_commandPending;
extern volatile bool  g_factoryResetPending;    // set when broker sends action=factory_reset
extern volatile bool  g_otaPending;             // set when broker sends action=ota
extern volatile bool  g_emptyHopperPending;     // set when broker sends action=empty_hopper
extern volatile bool  g_calibrateEmptyPending;  // set when broker sends action=calibrate_empty
extern volatile bool  g_calibrateFullPending;   // set when broker sends action=calibrate_full
extern PendingCommand g_pendingCommand;
extern OtaCommand     g_otaCommand;

// ─── API ─────────────────────────────────────────────────────────────────────

// Connect to the MQTT broker using the supplied credentials.
// Subscribes to feeder/{deviceId}/cmd and immediately publishes a heartbeat.
// Returns true on success.
bool mqtt_connect(const Credentials& creds);

// Returns true if the MQTT client is currently connected.
bool mqtt_is_connected();

// Process incoming messages and maintain the MQTT keepalive.
// Call on every loop() iteration (and inside dispenser_run).
void mqtt_loop();

// Publish a status message to feeder/{deviceId}/status.
// Pass command_id = nullptr and dispensed_g = -1 for a plain heartbeat.
// error_message is optional (default nullptr) — set it when status == "error"
// and there's a human-readable reason worth surfacing; device-service logs it
// into the device's event log (see services/device-service/src/lib/mqtt.ts).
void mqtt_publish_status(const char* command_id,
                         int         dispensed_g,
                         int         hopper_pct,
                         const char* status,             // "ok" | "error" | "low_hopper"
                         const char* error_message = nullptr);

// ─── Physical Meal/Snack button presses (see TaskList #10) ──────────────────
// Publish a button-press request to feeder/{deviceId}/button:
//   { "feed_type": "meal" | "snack" }
// feed_type must be exactly "meal" or "snack". Fire-and-forget — the device
// has no way to know which pet it feeds, the portion size, or whether a feed
// is already in progress (see services/feed-service /internal/button-press,
// which resolves all of that and runs the request through the normal
// createDispense() path). This call simply reports the gesture and returns;
// the resulting dispense — if any — arrives back as an ordinary MQTT command
// on feeder/{deviceId}/cmd, same as an app- or schedule-triggered feed.
void mqtt_publish_button_press(const char* feed_type);

// NOTE: MQTT_MAX_PACKET_SIZE is set to 1024 via build_flags in platformio.ini
// (-DMQTT_MAX_PACKET_SIZE=1024) so the define applies to PubSubClient.cpp's
// compilation unit as well as this one.  We also call setBufferSize() at
// runtime (see mqtt_connect) as a belt-and-suspenders guarantee.

#include "config.h"
#include "mqtt_conn.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Global command state (declared in mqtt_conn.h) ──────────────────────────
volatile bool  g_commandPending       = false;
volatile bool  g_factoryResetPending  = false;
volatile bool  g_otaPending           = false;
volatile bool  g_emptyHopperPending   = false;
volatile bool  g_calibrateEmptyPending = false;
volatile bool  g_calibrateFullPending  = false;
PendingCommand g_pendingCommand        = {};
OtaCommand     g_otaCommand            = {};

// ─── Module-level state ───────────────────────────────────────────────────────
static WiFiClient    s_wifiClient;
static PubSubClient  s_mqtt(s_wifiClient);

// Topic strings built from the device UUID during mqtt_connect().
static String s_cmdTopic;
static String s_statusTopic;
static String s_buttonTopic;

// ─── Message callback ─────────────────────────────────────────────────────────
static void onMessage(const char* topic, uint8_t* payload, unsigned int length) {
    // Null-terminate the payload so we can parse it as a string.
    char buf[MQTT_MAX_PACKET];
    unsigned int len = min(length, (unsigned int)(MQTT_MAX_PACKET - 1));
    memcpy(buf, payload, len);
    buf[len] = '\0';

    log_i("[mqtt] Received on %s: %s", topic, buf);

    JsonDocument doc;
    if (deserializeJson(doc, buf) != DeserializationError::Ok) {
        log_e("[mqtt] JSON parse error");
        return;
    }

    const char* action = doc["action"];
    if (!action) {
        log_w("[mqtt] Message missing 'action' field");
        return;
    }

    // Factory reset — wipe NVS and reboot into provisioning mode.
    if (strcmp(action, "factory_reset") == 0) {
        log_w("[mqtt] Factory reset command received from broker");
        g_factoryResetPending = true;
        return;
    }

    // Maintenance commands — executed in the OPERATIONAL state by main.cpp.
    if (strcmp(action, "empty_hopper") == 0) {
        log_i("[mqtt] Empty-hopper command received");
        g_emptyHopperPending = true;
        return;
    }
    if (strcmp(action, "calibrate_empty") == 0) {
        log_i("[mqtt] Calibrate-empty command received");
        g_calibrateEmptyPending = true;
        return;
    }
    if (strcmp(action, "calibrate_full") == 0) {
        log_i("[mqtt] Calibrate-full command received");
        g_calibrateFullPending = true;
        return;
    }

    // OTA firmware update command.
    if (strcmp(action, "ota") == 0) {
        const char* url     = doc["url"];
        const char* version = doc["version"];
        const char* cmdId   = doc["command_id"];
        if (!url || !version || !cmdId) {
            log_e("[mqtt] Invalid OTA command — missing url, version, or command_id");
            return;
        }
        strlcpy(g_otaCommand.command_id, cmdId,   sizeof(g_otaCommand.command_id));
        strlcpy(g_otaCommand.url,        url,     sizeof(g_otaCommand.url));
        strlcpy(g_otaCommand.version,    version, sizeof(g_otaCommand.version));
        g_otaPending = true;
        log_i("[mqtt] OTA command queued: v%s from %s", version, url);
        return;
    }

    if (strcmp(action, "dispense") != 0) {
        log_w("[mqtt] Unknown action: %s", action);
        return;
    }

    // If a command is already queued, reject the new one gracefully.
    if (g_commandPending) {
        log_w("[mqtt] Command already pending — ignoring new command");
        return;
    }

    const char* cmdId  = doc["command_id"];
    int         weight = doc["weight_g"] | 0;

    if (!cmdId || weight <= 0) {
        log_e("[mqtt] Invalid dispense command (missing command_id or weight_g)");
        return;
    }

    strlcpy(g_pendingCommand.command_id, cmdId, sizeof(g_pendingCommand.command_id));
    g_pendingCommand.weight_g = weight;
    g_commandPending = true;

    log_i("[mqtt] Queued dispense: %dg  command_id: %s", weight, cmdId);
}

// ─── Public API ───────────────────────────────────────────────────────────────

bool mqtt_connect(const Credentials& creds) {
    // Derive the bare device UUID by stripping the "device_" prefix from
    // the stored client ID (e.g. "device_abc123" → "abc123").
    String clientIdStr = String(creds.mqtt_client_id);
    String deviceId    = clientIdStr.startsWith("device_")
                            ? clientIdStr.substring(7)
                            : clientIdStr;

    s_cmdTopic    = "feeder/" + deviceId + "/cmd";
    s_statusTopic = "feeder/" + deviceId + "/status";
    s_buttonTopic = "feeder/" + deviceId + "/button";

    log_i("[mqtt] Connecting to %s:%d as %s", creds.mqtt_broker, creds.mqtt_port, creds.mqtt_client_id);

    s_mqtt.setServer(creds.mqtt_broker, creds.mqtt_port);
    s_mqtt.setBufferSize(MQTT_MAX_PACKET);  // runtime guarantee; build flag sets compile-time default
    s_mqtt.setCallback(onMessage);
    s_mqtt.setKeepAlive(60);

    // LWT is published by the broker if this client disconnects unexpectedly
    // (power-loss, WiFi drop, etc.). The device-service MQTT handler treats an
    // LWT status message the same as a normal status message and marks the device offline.
    String lwtPayload = "{\"status\":\"offline\",\"hopper_pct\":0,\"firmware_version\":\"";
    lwtPayload += FIRMWARE_VERSION;
    lwtPayload += "\"}";

    uint32_t deadline = millis() + MQTT_CONNECT_TIMEOUT_MS;
    while (!s_mqtt.connected() && millis() < deadline) {
        if (s_mqtt.connect(
                creds.mqtt_client_id,
                creds.mqtt_user,
                creds.mqtt_pass,
                s_statusTopic.c_str(),   // LWT topic
                /*willQos=*/1,
                /*willRetain=*/false,
                lwtPayload.c_str()       // LWT message
            )) {
            log_i("[mqtt] Connected");
            s_mqtt.subscribe(s_cmdTopic.c_str(), /*qos=*/1);
            log_i("[mqtt] Subscribed to %s", s_cmdTopic.c_str());
            return true;
        }
        log_w("[mqtt] Connect failed (state=%d) — retrying...", s_mqtt.state());
        delay(2000);
    }

    log_e("[mqtt] Could not connect within timeout");
    return false;
}

bool mqtt_is_connected() {
    return s_mqtt.connected();
}

void mqtt_loop() {
    s_mqtt.loop();
}

void mqtt_publish_status(const char* command_id,
                         int         dispensed_g,
                         int         hopper_pct,
                         const char* status,
                         const char* error_message) {
    if (!s_mqtt.connected()) {
        log_w("[mqtt] Cannot publish — not connected");
        return;
    }

    JsonDocument doc;
    if (command_id != nullptr)    doc["command_id"]   = command_id;
    if (dispensed_g >= 0)         doc["dispensed_g"]  = dispensed_g;
    if (error_message != nullptr) doc["error_message"] = error_message;
    doc["hopper_pct"]       = hopper_pct;
    doc["status"]           = status;
    doc["firmware_version"] = FIRMWARE_VERSION;

    // Larger than the other payloads in this file — error_message can add a
    // meaningful number of bytes on top of the usual fields.
    char buf[384];
    size_t n = serializeJson(doc, buf, sizeof(buf));

    if (s_mqtt.publish(s_statusTopic.c_str(), (uint8_t*)buf, n, /*retain=*/false)) {
        log_i("[mqtt] Published status: %s", buf);
    } else {
        log_e("[mqtt] Publish failed");
    }
}

void mqtt_publish_button_press(const char* feed_type) {
    if (!s_mqtt.connected()) {
        log_w("[mqtt] Cannot publish button press — not connected");
        return;
    }

    JsonDocument doc;
    doc["feed_type"] = feed_type;

    char buf[64];
    size_t n = serializeJson(doc, buf, sizeof(buf));

    if (s_mqtt.publish(s_buttonTopic.c_str(), (uint8_t*)buf, n, /*retain=*/false)) {
        log_i("[mqtt] Published button press: %s", buf);
    } else {
        log_e("[mqtt] Button press publish failed");
    }
}

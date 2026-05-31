// IMPORTANT: MQTT_MAX_PACKET_SIZE must be a plain #define before PubSubClient.h
// is first included — constexpr / enum values do not satisfy its #if checks.
#define MQTT_MAX_PACKET_SIZE 512

#include "config.h"
#include "mqtt_conn.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── Global command state (declared in mqtt_conn.h) ──────────────────────────
volatile bool  g_commandPending      = false;
volatile bool  g_factoryResetPending = false;
PendingCommand g_pendingCommand      = {};

// ─── Module-level state ───────────────────────────────────────────────────────
static WiFiClient    s_wifiClient;
static PubSubClient  s_mqtt(s_wifiClient);

// Topic strings built from the device UUID during mqtt_connect().
static String s_cmdTopic;
static String s_statusTopic;

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

    log_i("[mqtt] Connecting to %s:%d as %s", creds.mqtt_broker, creds.mqtt_port, creds.mqtt_client_id);

    s_mqtt.setServer(creds.mqtt_broker, creds.mqtt_port);
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
                         const char* status) {
    if (!s_mqtt.connected()) {
        log_w("[mqtt] Cannot publish — not connected");
        return;
    }

    JsonDocument doc;
    if (command_id != nullptr) doc["command_id"] = command_id;
    if (dispensed_g >= 0)      doc["dispensed_g"] = dispensed_g;
    doc["hopper_pct"]       = hopper_pct;
    doc["status"]           = status;
    doc["firmware_version"] = FIRMWARE_VERSION;

    char buf[256];
    size_t n = serializeJson(doc, buf, sizeof(buf));

    if (s_mqtt.publish(s_statusTopic.c_str(), (uint8_t*)buf, n, /*retain=*/false)) {
        log_i("[mqtt] Published status: %s", buf);
    } else {
        log_e("[mqtt] Publish failed");
    }
}

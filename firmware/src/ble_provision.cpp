#include "ble_provision.h"
#include "config.h"
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <WiFi.h>   // for MAC address

// ─── GATT UUIDs — must match ServlGattUuids.kt ───────────────────────────────
static const char* UUID_SERVICE        = "0000FE00-5345-524C-0000-534552564C31";
static const char* UUID_SSID           = "0000FE01-5345-524C-0000-534552564C31";
static const char* UUID_WIFI_PASS      = "0000FE02-5345-524C-0000-534552564C31";
static const char* UUID_MQTT_CFG       = "0000FE03-5345-524C-0000-534552564C31";
static const char* UUID_COMMIT         = "0000FE04-5345-524C-0000-534552564C31";
static const char* UUID_STATUS_NOTIFY  = "0000FE05-5345-524C-0000-534552564C31";

// ─── Module state ─────────────────────────────────────────────────────────────
static NimBLECharacteristic* s_statusNotifyChar = nullptr;
static volatile bool          s_commitPending   = false;
static NimBLEServer*          s_bleServer        = nullptr;

// Working credential buffer — populated by GATT write callbacks.
static Credentials s_pendingCreds = {};

// ─── Server callbacks ─────────────────────────────────────────────────────────
class ProvisionServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) override {
        log_i("[ble] Client connected");
        // Stop advertising once a client connects; avoids unnecessary interference.
        NimBLEDevice::getAdvertising()->stop();
    }

    void onDisconnect(NimBLEServer* pServer) override {
        log_i("[ble] Client disconnected — resuming advertising");
        NimBLEDevice::getAdvertising()->start();
    }
};

// ─── Characteristic callbacks ─────────────────────────────────────────────────
class SsidCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pChar) override {
        std::string val = pChar->getValue();
        strlcpy(s_pendingCreds.ssid, val.c_str(), sizeof(s_pendingCreds.ssid));
        log_i("[ble] SSID written: %s", s_pendingCreds.ssid);
    }
};

class WifiPassCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pChar) override {
        std::string val = pChar->getValue();
        strlcpy(s_pendingCreds.wifi_pass, val.c_str(), sizeof(s_pendingCreds.wifi_pass));
        log_i("[ble] WiFi password written (%d chars)", (int)val.size());
    }
};

class MqttCfgCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pChar) override {
        std::string val = pChar->getValue();
        log_i("[ble] MQTT config written: %s", val.c_str());

        JsonDocument doc;
        if (deserializeJson(doc, val.c_str()) != DeserializationError::Ok) {
            log_e("[ble] MQTT config JSON parse error");
            return;
        }

        const char* broker   = doc["broker"];
        int         port     = doc["port"] | 1883;
        const char* clientId = doc["client_id"];
        const char* user     = doc["user"];
        const char* pass     = doc["pass"];

        if (broker)   strlcpy(s_pendingCreds.mqtt_broker,    broker,   sizeof(s_pendingCreds.mqtt_broker));
        if (clientId) strlcpy(s_pendingCreds.mqtt_client_id, clientId, sizeof(s_pendingCreds.mqtt_client_id));
        if (user)     strlcpy(s_pendingCreds.mqtt_user,      user,     sizeof(s_pendingCreds.mqtt_user));
        if (pass)     strlcpy(s_pendingCreds.mqtt_pass,      pass,     sizeof(s_pendingCreds.mqtt_pass));
        s_pendingCreds.mqtt_port = port;
    }
};

class CommitCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pChar) override {
        std::string val = pChar->getValue();
        if (!val.empty() && (uint8_t)val[0] == 0x01) {
            log_i("[ble] COMMIT received — triggering credential test");
            s_commitPending = true;
        } else {
            log_w("[ble] COMMIT written with unexpected value");
        }
    }
};

// Static instances of callbacks (NimBLE does not own them).
static ProvisionServerCallbacks s_serverCbs;
static SsidCallbacks            s_ssidCbs;
static WifiPassCallbacks        s_wifiPassCbs;
static MqttCfgCallbacks         s_mqttCfgCbs;
static CommitCallbacks          s_commitCbs;

// ─── Public API ───────────────────────────────────────────────────────────────

void ble_provision_start() {
    // Build a unique device name from the last 4 hex digits of the MAC address.
    uint8_t mac[6];
    WiFi.macAddress(mac);   // reads MAC even before WiFi.begin()
    char bleName[16];
    snprintf(bleName, sizeof(bleName), "%s%02X%02X", BLE_NAME_PREFIX, mac[4], mac[5]);

    log_i("[ble] Starting provisioning server as \"%s\"", bleName);

    NimBLEDevice::init(bleName);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9); // max TX power

    s_bleServer = NimBLEDevice::createServer();
    s_bleServer->setCallbacks(&s_serverCbs);

    NimBLEService* pSvc = s_bleServer->createService(UUID_SERVICE);

    // SSID — write only
    NimBLECharacteristic* pSsid = pSvc->createCharacteristic(UUID_SSID, NIMBLE_PROPERTY::WRITE);
    pSsid->setCallbacks(&s_ssidCbs);

    // WiFi password — write only
    NimBLECharacteristic* pWifiPass = pSvc->createCharacteristic(UUID_WIFI_PASS, NIMBLE_PROPERTY::WRITE);
    pWifiPass->setCallbacks(&s_wifiPassCbs);

    // MQTT config — write only (JSON payload, up to 300 bytes)
    NimBLECharacteristic* pMqttCfg = pSvc->createCharacteristic(UUID_MQTT_CFG, NIMBLE_PROPERTY::WRITE);
    pMqttCfg->setCallbacks(&s_mqttCfgCbs);

    // Commit — write only
    NimBLECharacteristic* pCommit = pSvc->createCharacteristic(UUID_COMMIT, NIMBLE_PROPERTY::WRITE);
    pCommit->setCallbacks(&s_commitCbs);

    // Status notify — indicate + notify so Android can receive the result
    s_statusNotifyChar = pSvc->createCharacteristic(
        UUID_STATUS_NOTIFY,
        NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::INDICATE
    );

    pSvc->start();

    // Advertise the provisioning service UUID so the Android scan filter matches.
    NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
    pAdv->addServiceUUID(UUID_SERVICE);
    pAdv->setScanResponse(true);
    pAdv->start();

    log_i("[ble] Advertising started");
}

void ble_provision_stop() {
    log_i("[ble] Stopping BLE");
    NimBLEDevice::deinit(true);
}

bool ble_provision_commit_pending() {
    return s_commitPending;
}

Credentials ble_provision_get_credentials() {
    return s_pendingCreds;
}

void ble_provision_notify_result(const char* result) {
    if (!s_statusNotifyChar) return;
    s_statusNotifyChar->setValue(result);
    s_statusNotifyChar->notify();
    log_i("[ble] Notified result: %s", result);
}

void ble_provision_clear_commit() {
    s_commitPending = false;
}

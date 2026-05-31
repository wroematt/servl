#pragma once
#include <Arduino.h>

// ─── Credentials structure ───────────────────────────────────────────────────
// All fields received from the Android app via BLE GATT provisioning.
struct Credentials {
    char ssid[64];
    char wifi_pass[128];
    char mqtt_broker[128];
    int  mqtt_port;
    char mqtt_client_id[64];   // "device_<uuid>"
    char mqtt_user[64];
    char mqtt_pass[128];
};

// ─── API ─────────────────────────────────────────────────────────────────────

// Returns true if all required credential keys are present in NVS.
bool storage_has_credentials();

// Persist credentials to NVS.  Overwrites any existing values.
void storage_save(const Credentials& c);

// Read credentials from NVS.  Call storage_has_credentials() first.
Credentials storage_load();

// Erase all credential keys from NVS (factory reset).
void storage_clear();

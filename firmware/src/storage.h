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

// ─── Hopper scale calibration ────────────────────────────────────────────────
// The HX711 reports raw ADC counts relative to an internal "offset" set by
// tare() — we tare against the EMPTY hopper and persist that raw offset here,
// so "0 g" always means "empty hopper" and stays comparable across reboots
// without physically emptying the hopper every time the device restarts.
// See scale.h for how this is used and scale_recalibrate_empty() for how it
// gets (re-)established when the baseline drifts over days/weeks.

// Returns true if an empty-hopper baseline offset has been persisted.
bool storage_has_scale_offset();

// Persist the HX711 raw tare offset representing "hopper empty". Overwrites
// any existing value.
void storage_save_scale_offset(long offset);

// Read the persisted offset. Returns 0 if none has been saved — callers
// should check storage_has_scale_offset() first (0 is a perfectly valid raw
// offset, not a sentinel).
long storage_load_scale_offset();

// Erase all persisted state from NVS — credentials AND the scale calibration
// offset (factory reset / re-provisioning a relocated unit should not inherit
// a stale baseline from its previous home).
void storage_clear();

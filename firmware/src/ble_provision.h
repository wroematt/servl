#pragma once
#include <Arduino.h>
#include "storage.h"

// Initialise and start the NimBLE GATT server.
// The device advertises PROVISION_SERVICE UUID with the name "Servl-XXXX"
// (XXXX = last 4 hex digits of WiFi MAC address).
// BLE is ready for the Android app to write credentials after this returns.
void ble_provision_start();

// Stop BLE advertising and deinitialise the NimBLE stack.
// Call after credentials have been verified and saved.
void ble_provision_stop();

// Returns true if the commit characteristic has been written and the main
// loop should begin the WiFi + MQTT credential test.
bool ble_provision_commit_pending();

// Clear the commit flag so the device can accept a new commit after a failed
// provisioning attempt (e.g. wrong password → user corrects and retries).
void ble_provision_clear_commit();

// Retrieve the credentials that were written by the Android app before commit.
// Only valid when ble_provision_commit_pending() returns true.
Credentials ble_provision_get_credentials();

// Notify the connected Android app of the provisioning result.
// Call once with "OK" or a message like "ERROR:wifi" / "ERROR:mqtt".
void ble_provision_notify_result(const char* result);

#pragma once
#include <Arduino.h>

// Attempt to connect to the given WiFi network.
// Blocks until connected or timeout_ms elapses.
// Returns true on success.
bool wifi_connect(const char* ssid, const char* pass,
                  uint32_t timeout_ms = 15000);

// Returns true if currently connected.
bool wifi_is_connected();

// Call on every loop() iteration.
// If the connection has been lost, reconnects silently using the last
// known credentials (does not block — re-schedules on next iterations).
void wifi_maintain();

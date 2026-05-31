#pragma once
#include <Arduino.h>

// Simulate dispensing by flashing the built-in LED once per gram.
// Blocks the caller for (weight_g * (FLASH_ON_MS + FLASH_OFF_MS)) ms.
// Calls mqtt_loop() once per gram to keep the MQTT connection alive.
// Updates the virtual hopper level after dispensing.
void dispenser_run(int weight_g);

// Current virtual hopper level (0–100).  Starts at 100 on boot and
// decrements by 1 per gram dispensed (floor at 0).
int dispenser_get_hopper_pct();

// Reset the virtual hopper to 100 % (call on boot).
void dispenser_reset_hopper();

#pragma once
#include <Arduino.h>

// Drives the servo-controlled gravity chute to dispense the requested weight
// using CLOSED-LOOP weight feedback from the hopper scale (scale.h): take an
// initial reading, open the chute to SERVO_OPEN_DEG while vibrating ±1° to
// encourage kibble flow, poll the scale until the measured weight has dropped
// by the requested amount (or DISPENSE_TIMEOUT_MS trips), then close the chute.
// The INA169 current sensor is monitored throughout — sustained high current
// indicates a jam and triggers a clearance cycle (close slightly, vibrate
// aggressively, reopen).
//
// Pumps mqtt_loop() periodically so the MQTT connection survives the multi-
// second dispense window.

// Attach the servo to PIN_SERVO and configure the ADC for the current sensor.
// Call once from setup(), before the first dispenser_run().
void dispenser_init();

// Dispense weight_g grams by opening the servo chute. Blocks until the scale
// confirms the weight has dropped, or DISPENSE_TIMEOUT_MS elapses.
void dispenser_run(int weight_g);

// Open the chute and keep it open until the scale reads < 5 g (effectively
// empty) or EMPTY_HOPPER_TIMEOUT_MS elapses. Used for cleaning the hopper.
void dispenser_empty_hopper();

// Grams *actually measured* as removed during the most recent dispenser_run().
// May be less than requested if the dispense timed out.
int dispenser_get_last_dispensed_g();

// False if the most recent dispenser_run() hit DISPENSE_TIMEOUT_MS before
// reaching the target weight.
bool dispenser_last_run_ok();

// Current hopper level estimate (0–100 %). Uses the persisted full-hopper
// calibration weight (storage.h) if available, otherwise falls back to
// HOPPER_CAPACITY_G (config.h).
int dispenser_get_hopper_pct();

// Refresh the hopper level estimate with a fresh reading from the scale.
// Called on boot, before every heartbeat, and after a calibration command.
void dispenser_reset_hopper();

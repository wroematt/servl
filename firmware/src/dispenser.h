#pragma once
#include <Arduino.h>

// Drives the auger stepper motor to dispense the requested weight, using the
// STEPPER_STEPS_PER_GRAM calibration constant (config.h: currently "1/4 turn
// ≈ 1 g", tune that constant as the mechanical assembly is calibrated).
// Blocks the caller until the rotation completes; pumps mqtt_loop()
// periodically via stepper_move() so the connection survives long dispenses.
// Updates the hopper level estimate after dispensing.
//
// TODO(load cells / hopper scale — see TaskList #9): hopper_pct is currently
// an open-loop estimate (-1 % per gram dispensed, floored at 0) because no
// weight sensing exists yet. Once the load-cell hopper scale lands, this
// becomes a real measurement referenced against a calibrated empty-hopper
// baseline, and the dispense itself becomes closed-loop (run the motor until
// the measured weight has dropped by weight_g, rather than turning a
// pre-computed number of steps) for much better accuracy than the
// turns-per-gram estimate this function currently relies on.
void dispenser_run(int weight_g);

// Current hopper level estimate (0–100). Starts at 100 on boot and
// decrements by ~1 per gram dispensed (floor at 0). See TODO above —
// this is a placeholder until real weight sensing exists.
int dispenser_get_hopper_pct();

// Reset the hopper estimate to 100 % (call on boot).
void dispenser_reset_hopper();

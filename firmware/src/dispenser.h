#pragma once
#include <Arduino.h>

// Drives the auger stepper motor to dispense the requested weight using
// CLOSED-LOOP weight feedback from the hopper scale (scale.h): take an
// initial reading, run the auger at a constant speed until the measured
// weight has dropped by the requested amount (or a safety timeout trips —
// DISPENSE_TIMEOUT_MS in config.h), then take a final reading and report what
// was *actually* removed. Per the TaskList #9 spec this supersedes the
// open-loop turns-based approach from TaskList #8 — STEPPER_STEPS_PER_GRAM
// remains in config.h only as the historical starting point that
// STEPPER_DISPENSE_SPEED_STEPS_PER_SEC was calibrated from.
//
// Pumps mqtt_loop() periodically (via stepper_run_until()) so the connection
// survives what can be a multi-second rotation.
void dispenser_run(int weight_g);

// Grams *actually measured* as removed during the most recent dispenser_run()
// — the closed-loop delta, accurate over the few-second timescale of a single
// dispense (see scale.h for why short-timescale deltas stay accurate even as
// the long-term baseline drifts). May be less than the requested amount if
// the dispense hit the safety timeout. main.cpp reports this — not the
// requested amount — as feed_events.weight_dispensed_g, so the record
// reflects what actually happened (see CLAUDE.md MQTT confirmation-loop
// design rationale).
int dispenser_get_last_dispensed_g();

// False if the most recent dispenser_run() hit DISPENSE_TIMEOUT_MS before
// reaching the target weight (jam, empty hopper, miscalibrated scale, etc).
// main.cpp uses this to publish status "error" (with an explanatory
// error_message) instead of "ok".
bool dispenser_last_run_ok();

// Current hopper level estimate (0-100): the live scale reading — already
// relative to the calibrated empty-hopper baseline, see scale.h — as a
// percentage of HOPPER_CAPACITY_G (config.h). Long-term accuracy is bounded
// by how recently the empty baseline was (re)calibrated
// (scale_recalibrate_empty()); the per-dispense delta above is the accurate,
// short-timescale figure, this is the coarser, long-timescale one — exactly
// the two-tier accuracy split the TaskList #9 spec calls for.
int dispenser_get_hopper_pct();

// Refresh the hopper level estimate with a fresh reading from the scale.
// Called on boot, before every status publish (heartbeat or dispense
// confirmation), and after a recalibration — so the reported %-full always
// reflects the live measurement rather than a stale cached guess. (Name kept
// from the pre-load-cell placeholder for main.cpp call-site stability; it no
// longer "resets" anything; it measures.)
void dispenser_reset_hopper();

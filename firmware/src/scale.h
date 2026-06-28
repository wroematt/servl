#pragma once
#include <Arduino.h>

// Thin wrapper around the HX711 ADC reading the hopper's 4x load cells (all
// four wired into a single summing junction ahead of one HX711 — the firmware
// only ever talks to a single combined channel and has no visibility into the
// individual cells). Owns only the low-level measurement concerns (chip init,
// raw reads, averaging, the persisted zero-offset); dispenser.cpp owns what
// the readings *mean* (closed-loop dispensing, %-full estimation).
//
// ─── Calibration model ───────────────────────────────────────────────────────
// The HX711 reports raw ADC counts relative to an internal "offset" — the
// counts present the last time tare() was called. We tare against the EMPTY
// hopper and persist that raw offset (storage_save/_load_scale_offset), so:
//
//   grams = (raw_counts - persisted_empty_offset) / SCALE_CALIBRATION_FACTOR
//
// ...meaning "0 g" always means "hopper empty" and stays comparable across
// reboots, without physically emptying the hopper on every restart.
//
// SCALE_CALIBRATION_FACTOR (config.h) is a fixed raw-counts-per-gram constant
// — exactly like STEPPER_STEPS_PER_GRAM in TaskList #8, it's a "tune once the
// hardware is final" placeholder for a fixed sensor property, so it lives in
// config.h rather than NVS.
//
// The persisted empty-hopper offset, by contrast, DOES drift over days/weeks
// (load-cell creep, temperature, food residue building up on the platform —
// see CLAUDE.md TaskList #9 spec) — that's exactly what
// scale_recalibrate_empty() exists to re-establish.
//
// This split is also why dispensing is closed-loop on a *delta* (current
// reading minus a reading taken seconds earlier) rather than on the absolute
// "grams from empty" figure: deltas over a few seconds are unaffected by
// long-term zero drift, so they remain the accurate measurement, while the
// absolute %-full estimate is the coarser, longer-timescale one.

// Initialise the HX711 and restore the persisted empty-hopper offset. If none
// has ever been saved (first boot ever), performs a fresh tare and persists
// the result — THIS ASSUMES THE HOPPER IS EMPTY, which is only safe to assume
// on a brand new, not-yet-filled unit. Logs a loud warning either way so this
// assumption is visible in the device log. Call once from setup(), before the
// first scale_read_grams().
//
// Bounded by SCALE_READY_TIMEOUT_MS: if the HX711 never reports a conversion
// ready (no chip wired up — e.g. bench-testing the stepper in isolation
// before the load cells are connected, per the intended #8 → #9 → #10
// incremental hardware bring-up order — or a failed sensor), this logs a
// loud warning and returns rather than blocking forever. See scale_is_present().
void scale_init();

// True if the HX711 responded within SCALE_READY_TIMEOUT_MS during
// scale_init() AND is still responding now. False means the hopper scale is
// absent, disconnected, or has stopped responding — scale_read_grams()
// returns NAN in that state instead of blocking forever, and dispenser.cpp
// falls back to a bounded open-loop dispense (see dispenser_run()).
bool scale_is_present();

// True once the HX711 reports a conversion is ready. scale_read_grams() and
// scale_recalibrate_empty() block until this is true — avoid calling them on
// every iteration of a tight loop (e.g. mid-rotation); see
// stepper_run_until()'s coarse poll interval for how dispenser.cpp handles
// this.
bool scale_is_ready();

// Current weight in grams, relative to the persisted empty-hopper baseline
// (0 g == empty), averaged over SCALE_SAMPLES raw reads to smooth out
// load-cell noise. Blocks until SCALE_SAMPLES conversions complete — bounded
// by SCALE_READY_TIMEOUT_MS. Returns NAN if the scale is absent/not
// responding (see scale_is_present()) — callers MUST check with isnan()
// before trusting the result.
float scale_read_grams();

// Re-tare against whatever load is on the platform RIGHT NOW and persist the
// resulting raw offset as the new "empty hopper" baseline — i.e. "the hopper
// is empty at this exact moment, remember it." Wired to the BOOT button short
// hold (CALIBRATE_HOLD_MS in config.h) and to the remote "calibrate_empty"
// MQTT command. Only call when the hopper is genuinely empty.
void scale_recalibrate_empty();

// Read the current weight (grams above the empty baseline) and persist it as
// the full-hopper 100% reference weight (see storage.h / storage_save_full_weight).
// Call this when the hopper is filled to capacity. Returns the stored grams
// value, or 0.0 if the scale is absent/unresponsive.
float scale_calibrate_full();

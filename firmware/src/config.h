#pragma once
#include <Arduino.h>    // uint8_t, uint32_t, etc. from the ESP32 toolchain

// ─── Hardware pins ───────────────────────────────────────────────────────────
// GPIO27 = external LED (active HIGH).  GPIO2 (built-in) was not reliably
//          usable on this board variant so an external LED on GPIO27 is used.
// GPIO0  = BOOT button (active LOW)
constexpr uint8_t PIN_LED    = 27;
constexpr uint8_t PIN_BUTTON = 0;

// Stepper driver (STEP/DIR/ENABLE interface — matches A4988 / DRV8825 /
// TMC2208-style boards). STEP pulses on each rising edge advance the motor
// one (micro)step; DIR sets rotation direction; ENABLE is active-LOW (the
// driver only energises its coils while this pin is held low).
constexpr uint8_t PIN_STEPPER_STEP   = 25;
constexpr uint8_t PIN_STEPPER_DIR    = 26;
constexpr uint8_t PIN_STEPPER_ENABLE = 33;

// HX711 load-cell ADC (DOUT/SCK interface). All 4 hopper load cells wire into
// a single summing junction ahead of one HX711 — the firmware only ever talks
// to one ADC channel and has no visibility into the individual cells.
constexpr uint8_t PIN_SCALE_DOUT = 4;
constexpr uint8_t PIN_SCALE_SCK  = 16;

// ─── Timing ──────────────────────────────────────────────────────────────────
// BOOT button hold gestures (two tiers — see check_factory_reset() in
// main.cpp). Held between CALIBRATE_HOLD_MS and RESET_HOLD_MS: recalibrate
// the empty-hopper scale baseline (hopper MUST be empty when triggered — see
// scale_recalibrate_empty()). Held past RESET_HOLD_MS: factory reset (erase
// credentials, reboot into provisioning). The gap between the two thresholds
// is intentionally wide enough to feel the LED's "calibrating" double-flash
// and let go before crossing into factory-reset territory by mistake.
constexpr uint32_t CALIBRATE_HOLD_MS = 1200;
constexpr uint32_t RESET_HOLD_MS     = 3000;

// How often the device publishes a heartbeat status message while operational.
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 30000;

// LED blink rate while a dispense is in progress — purely a visual "I'm
// working" indicator now that the stepper motor (not the LED) does the
// actual dispensing. Faster than any of the connection-state patterns in
// led_status.cpp so it reads as distinctly "busy".
constexpr uint32_t DISPENSE_BLINK_ON_MS  = 80;
constexpr uint32_t DISPENSE_BLINK_OFF_MS = 80;

// ─── Stepper motor (auger drive) ─────────────────────────────────────────────
// Full steps per revolution of the motor body (1.8°/step ⇒ 200; change to 48
// for a 7.5°/step motor, etc). Multiplied by the driver's microstepping
// setting — set on the driver board itself via MS1/MS2/MS3 jumpers/solder
// pads, NOT controlled from firmware, so it must be kept in sync with
// whatever the board is physically configured for.
constexpr uint16_t STEPPER_FULL_STEPS_PER_REV = 200;
constexpr uint16_t STEPPER_MICROSTEPS         = 16;
constexpr long     STEPPER_STEPS_PER_REV      =
    (long)STEPPER_FULL_STEPS_PER_REV * STEPPER_MICROSTEPS;

// ─── Calibration ─────────────────────────────────────────────────────────────
// Working assumption while we debug the mechanical assembly: a quarter turn
// of the auger dispenses ~1 g of dry food. This is almost certainly going to
// need tuning once the hopper/auger geometry is final — when it does, this is
// the one constant to change (everything else derives from it).
constexpr long STEPPER_STEPS_PER_GRAM = STEPPER_STEPS_PER_REV / 4;

// Motion profile. Conservative starting point — raise once the mechanical
// assembly is verified to run reliably without skipping steps at speed.
constexpr float STEPPER_MAX_SPEED_STEPS_PER_SEC = 800.0f;
constexpr float STEPPER_ACCEL_STEPS_PER_SEC2    = 400.0f;

// ─── Hopper scale (load cells) ───────────────────────────────────────────────
// Raw HX711 reads averaged into each scale reading to smooth out load-cell
// noise. Higher = steadier but slower (each read blocks until the chip
// reports a conversion ready, roughly SCALE_SAMPLES x ~100 ms at the HX711's
// default 10 SPS).
constexpr uint8_t SCALE_SAMPLES = 8;

// Raw-ADC-counts-per-gram for the wired-up load cells + HX711 combination.
// Like STEPPER_STEPS_PER_GRAM, this is a "tune once the hardware is final"
// placeholder constant rather than something that drifts session to session
// — a fixed property of the sensor wiring, so it lives here, not in NVS.
// (What DOES drift over time is the empty-hopper zero baseline — see
// scale.h / scale_recalibrate_empty() — which is persisted separately.)
constexpr float SCALE_CALIBRATION_FACTOR = 420.0f;

// Physical capacity of the hopper in grams when filled to the design line —
// a fixed hardware property (measure once the mechanical design is final).
// hopper_pct = current_weight_g / HOPPER_CAPACITY_G * 100, where
// current_weight_g is already relative to the calibrated empty baseline
// (0 g == empty — see scale.h).
constexpr float HOPPER_CAPACITY_G = 2000.0f;

// ─── Closed-loop dispensing ──────────────────────────────────────────────────
// Constant rotation speed while dispensing under weight feedback (see
// dispenser_run() / stepper_run_until()). No accel/decel profile is needed —
// unlike the open-loop move in TaskList #8 there's no pre-computed target
// distance to ramp toward, just "go until the scale says stop". Conservative
// starting point, similar to the open-loop motion profile above.
constexpr float STEPPER_DISPENSE_SPEED_STEPS_PER_SEC = 400.0f;

// How often the closed-loop dispense loop takes a weight reading and checks
// progress. Reading the scale blocks for SCALE_SAMPLES HX711 conversions, so
// — exactly like onTick in stepper_move() — it must be throttled to a coarse
// interval rather than checked every iteration, or step timing suffers.
constexpr uint32_t DISPENSE_POLL_INTERVAL_MS = 250;

// Safety cutoff: abort a dispense if the measured weight hasn't dropped by
// the requested amount within this time, rather than spinning the auger
// forever (empty hopper, jam, miscalibrated scale, etc). Generous enough for
// the largest realistic portion at the conservative speed above; tune down
// once real-world dispense durations are known.
constexpr uint32_t DISPENSE_TIMEOUT_MS = 60000;

// WiFi and MQTT connection timeouts during provisioning commit test.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MQTT_CONNECT_TIMEOUT_MS =  8000;

// ─── MQTT ────────────────────────────────────────────────────────────────────
// Must be large enough for the largest inbound command JSON (~150 bytes) plus
// PubSubClient header overhead.  Defined here; mqtt_conn.cpp sets it before
// including PubSubClient.h.
constexpr int MQTT_MAX_PACKET = 1024;

// ─── Firmware identity ───────────────────────────────────────────────────────
constexpr char FIRMWARE_VERSION[] = "1.5.0";

// BLE device name prefix — last 4 hex digits of MAC are appended at runtime
// so multiple units can be distinguished (e.g. "Servl-A1B2").
constexpr char BLE_NAME_PREFIX[] = "Servl-";

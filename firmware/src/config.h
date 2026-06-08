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
constexpr uint8_t PIN_STEPPER_DIR    = 33;
constexpr uint8_t PIN_STEPPER_ENABLE = 32;

// HX711 load-cell ADC (DOUT/SCK interface). All 4 hopper load cells wire into
// a single summing junction ahead of one HX711 — the firmware only ever talks
// to one ADC channel and has no visibility into the individual cells.
constexpr uint8_t PIN_SCALE_DOUT = 26;
constexpr uint8_t PIN_SCALE_SCK  = 14;

// Physical Meal / Snack feed buttons (see TaskList #10 — "two buttons on the
// device will act as Meal and Snack feed buttons"). Wired active-LOW with
// internal pull-ups (configured via INPUT_PULLUP in buttons_init()).
//
// ⚠ GPIO12 (MEAL) is the MTDI strapping pin. The ESP32 samples it at power-on
// to choose flash voltage: LOW → 3.3 V (normal boot), HIGH → 1.8 V (boot
// failure on standard modules). INPUT_PULLUP is applied in setup(), AFTER the
// strapping sample, so the firmware is safe — but an external pull-up resistor
// wired to the button circuit would hold the pin HIGH before setup() runs and
// prevent the board from booting. Wire the button between GPIO12 and GND only;
// no external resistor is needed.
//
// GPIO13 (SNACK) is not a strapping pin and has no boot-time restrictions.
constexpr uint8_t PIN_BUTTON_MEAL  = 12;
constexpr uint8_t PIN_BUTTON_SNACK = 13;

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

// Meal/Snack button gesture timing (see buttons.h). "To trigger a feed the
// button must be double clicked to make it difficult for a pet to learn" —
// a single press does nothing; only two presses landing inside the window
// below count as a feed request.
//
// BUTTON_DEBOUNCE_MS: raw reads must be stable for this long before a level
// change is accepted as a real press/release (filters mechanical contact
// bounce — without it a single physical press can register as several).
//
// DOUBLE_CLICK_WINDOW_MS: maximum gap between the first and second press.
// Wide enough for a deliberate human double-tap, narrow enough that a pet
// idly pawing at the button is unlikely to land two presses inside it by chance.
constexpr uint32_t BUTTON_DEBOUNCE_MS     = 40;
constexpr uint32_t DOUBLE_CLICK_WINDOW_MS = 400;

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
constexpr uint16_t STEPPER_MICROSTEPS         = 32;
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
constexpr float STEPPER_MAX_SPEED_STEPS_PER_SEC = 6400.0f;
constexpr float STEPPER_ACCEL_STEPS_PER_SEC2    = 400.0f;

// ─── Hopper scale (load cells) ───────────────────────────────────────────────
// Raw HX711 reads averaged into each scale reading to smooth out load-cell
// noise. Higher = steadier but slower (each read blocks until the chip
// reports a conversion ready, roughly SCALE_SAMPLES x ~100 ms at the HX711's
// default 10 SPS).
constexpr uint8_t SCALE_SAMPLES = 8;

// Maximum time to wait for the HX711 to report a conversion ready before
// concluding it isn't physically present/responding — disconnected load
// cells, no chip wired up yet during incremental hardware bring-up (see
// TaskList #8/#9/#10 — the intent is to test the stepper, then the scale,
// then the buttons, AS EACH IS WIRED UP, not all at once), or a failed
// sensor in the field. Bounds what would otherwise be an indefinite block
// in the HX711 library's read()/tare()/get_units() (it loops on is_ready()
// with no timeout of its own) — see scale_wait_ready() in scale.cpp.
constexpr uint32_t SCALE_READY_TIMEOUT_MS = 3000;

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
// Cruising speed once stepper_run_until()'s brief ramp-up (below) completes.
//
// NOTE — this constant is in raw microsteps/sec, so the *physical* rotation
// rate it produces depends on STEPPER_STEPS_PER_REV (= full-steps/rev x
// microsteps). At 32x microstepping STEPPER_STEPS_PER_REV = 6400, so:
//
//   6400 steps/sec ÷ 6400 steps/rev = 1.0 rev/s (60 RPM)
//
// Bench-verified as a comfortable dispensing pace. Equal to
// STEPPER_MAX_SPEED_STEPS_PER_SEC here while debugging — tighten that cap or
// lower this constant once the mechanical assembly is finalised and the margin
// against step-skipping is known. Re-check this math any time
// STEPPER_MICROSTEPS or STEPPER_FULL_STEPS_PER_REV changes.
constexpr float STEPPER_DISPENSE_SPEED_STEPS_PER_SEC = 6400.0f;

// Ramp-up applied at the start of every closed-loop dispense (see
// stepper_run_until()). setSpeed()+runSpeed() — AccelStepper's constant-speed
// "free run" mode, used here because the stop point isn't known in advance —
// has NO built-in acceleration (that's move()+run()'s feature, for a
// pre-computed target distance). Snapping straight from a standstill to a
// few-hundred-steps/sec constant speed risks the motor momentarily stalling/
// losing synchronisation under the auger's load — which is exactly the
// "jerky, not smooth" feel reported on the bench. Ramping from a gentle
// starting speed up to cruising speed over STEPPER_RAMP_MS lets the rotor
// build momentum gracefully first; stepper_run_until() does this by hand,
// stepping setSpeed() upward on a timer.
constexpr float    STEPPER_RAMP_START_SPEED_STEPS_PER_SEC = 150.0f;
constexpr uint32_t STEPPER_RAMP_MS                         = 400;

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
constexpr uint32_t DISPENSE_TIMEOUT_MS = 10000;

// WiFi and MQTT connection timeouts during provisioning commit test.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MQTT_CONNECT_TIMEOUT_MS =  8000;

// ─── MQTT ────────────────────────────────────────────────────────────────────
// Must be large enough for the largest inbound command JSON (~150 bytes) plus
// PubSubClient header overhead.  Defined here; mqtt_conn.cpp sets it before
// including PubSubClient.h.
constexpr int MQTT_MAX_PACKET = 1024;

// ─── Firmware identity ───────────────────────────────────────────────────────
constexpr char FIRMWARE_VERSION[] = "1.6.2";

// BLE device name prefix — last 4 hex digits of MAC are appended at runtime
// so multiple units can be distinguished (e.g. "Servl-A1B2").
constexpr char BLE_NAME_PREFIX[] = "Servl-";

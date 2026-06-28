#pragma once
#include <Arduino.h>    // uint8_t, uint32_t, etc. from the ESP32 toolchain

// ─── Hardware pins ───────────────────────────────────────────────────────────
// GPIO27 = external LED (active HIGH).  GPIO2 (built-in) was not reliably
//          usable on this board variant so an external LED on GPIO27 is used.
// GPIO0  = BOOT button (active LOW)
constexpr uint8_t PIN_LED    = 27;
constexpr uint8_t PIN_BUTTON = 0;

// Servo motor (gravity chute — 0° = closed, 45° = fully open).
// PWM signal from GPIO25.
constexpr uint8_t PIN_SERVO = 25;

// INA169 high-side current monitor (analog output → ADC1 channel 5, GPIO33).
// Input-only GPIO — no pull-up/pull-down needed; external resistor sets
// the V_out range (see JAM_CURRENT_THRESHOLD below for calibration guidance).
constexpr uint8_t PIN_CURRENT_SENSE = 33;

// HX711 load-cell ADC (DOUT/SCK interface). All 4 hopper load cells wire into
// a single summing junction ahead of one HX711 — the firmware only ever talks
// to one ADC channel and has no visibility into the individual cells.
constexpr uint8_t PIN_SCALE_DOUT = 26;
constexpr uint8_t PIN_SCALE_SCK  = 14;

// Physical Meal / Snack feed buttons — active-LOW with internal pull-ups
// (GPIO34 requires an external 10 kΩ pull-up, GPIO13 uses INPUT_PULLUP).
constexpr uint8_t PIN_BUTTON_MEAL  = 34;
constexpr uint8_t PIN_BUTTON_SNACK = 13;

// ─── Servo chute angles ───────────────────────────────────────────────────────
// 0° = chute fully closed.  45° = chute fully open (≈10° physical chute angle
// due to the linkage geometry — enough for gravity to pull kibble through).
// During a dispense the servo vibrates ±SERVO_VIBRATE_AMP degrees around the
// open position to prevent bridging and encourage kibble flow.
constexpr int SERVO_CLOSED_DEG         = 0;
constexpr int SERVO_OPEN_DEG           = 45;
constexpr int SERVO_VIBRATE_AMP        = 1;    // ±1° oscillation amplitude
constexpr uint32_t SERVO_VIBRATE_INTERVAL_MS = 5;  // toggle every 5 ms → ~100 Hz
constexpr uint32_t SERVO_OPEN_SETTLE_MS      = 400; // wait after opening before dispense loop
constexpr uint32_t SERVO_CLOSE_SETTLE_MS     = 400; // wait after closing for kibble to settle

// ─── Servo position feedback ──────────────────────────────────────────────────
// The servo's internal potentiometer outputs an analogue voltage proportional to
// shaft angle: 0.28 V at 0° → 2.04 V at 180° (full travel). The chute only
// uses 0°–45°, which maps to ≈0.28 V (closed) → ≈0.72 V (open).
//
// GPIO32 (freed from the old stepper-enable pin) is used by default — adjust
// PIN_SERVO_FEEDBACK to whichever ADC1 GPIO you've actually wired it to.
constexpr uint8_t PIN_SERVO_FEEDBACK = 32;

// Voltage at the two mechanical extremes of the servo (V). Used to linearly
// interpolate expected ADC counts at any commanded angle (see dispenser.cpp).
constexpr float SERVO_FEEDBACK_V_AT_0DEG   = 0.28f;
constexpr float SERVO_FEEDBACK_V_AT_180DEG = 2.04f;

// If the servo's measured position falls more than this many degrees below the
// commanded angle, it is assumed to be mechanically blocked (jam). A wider
// tolerance avoids false trips from servo slop and ADC noise; tighten once
// the mechanical tolerances of the specific servo are known.
constexpr int JAM_POSITION_TOLERANCE_DEG = 8;

// ─── INA169 current-based jam detection ───────────────────────────────────────
// The INA169 outputs a voltage proportional to servo current; the ESP32 reads
// it via the 12-bit ADC (0–4095 counts over 0–3.3 V with ADC_11db attenuation).
//
// JAM_CURRENT_THRESHOLD: ADC counts above which sustained current is treated as
// a jam (kibble wedged in the chute against the servo arm).  The right value
// depends on your R_sense and R_load resistors:
//   V_out ≈ I_servo × R_sense × R_load / 1000
//   ADC   ≈ V_out / 3.3 × 4095
// Start high (400) and lower until genuine jams are caught without false trips
// on normal servo load.
constexpr int JAM_CURRENT_THRESHOLD   = 400;
constexpr uint32_t CURRENT_POLL_INTERVAL_MS = 50; // check current + position every 50 ms

// Jam clearance: close the chute slightly and vibrate aggressively to free
// the blockage before reopening.
constexpr int JAM_CLEAR_CLOSE_DEG    = 10;  // degrees to close from SERVO_OPEN_DEG
constexpr int JAM_CLEAR_CYCLES       = 15;  // vibration cycles during clearance
constexpr uint32_t JAM_CLEAR_HALF_PERIOD_MS = 25; // ms per half-cycle during clearance

// ─── Timing ──────────────────────────────────────────────────────────────────
// BOOT button hold gestures (two tiers — see check_factory_reset() in main.cpp):
//   short hold → recalibrate empty-hopper scale baseline (scale_recalibrate_empty())
//   long hold  → factory reset (erase credentials, reboot into provisioning)
constexpr uint32_t CALIBRATE_HOLD_MS = 1200;
constexpr uint32_t RESET_HOLD_MS     = 3000;

// Meal/Snack button double-click timing.
constexpr uint32_t BUTTON_DEBOUNCE_MS     = 40;
constexpr uint32_t DOUBLE_CLICK_WINDOW_MS = 400;

// How often the device publishes a heartbeat status message while operational.
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 30000;

// LED blink rate while dispensing.
constexpr uint32_t DISPENSE_BLINK_ON_MS  = 80;
constexpr uint32_t DISPENSE_BLINK_OFF_MS = 80;

// ─── Hopper scale (load cells) ───────────────────────────────────────────────
// Raw HX711 reads averaged per call to smooth load-cell noise (each read blocks
// ~100 ms at 10 SPS, so 8 samples ≈ 800 ms blocking per scale_read_grams() call).
constexpr uint8_t SCALE_SAMPLES = 8;

// Maximum time to wait for the HX711 before concluding it isn't present.
constexpr uint32_t SCALE_READY_TIMEOUT_MS = 3000;

// Raw-ADC-counts-per-gram for the wired load cells + HX711. Fixed hardware
// property — tune once and leave here, not in NVS.
constexpr float SCALE_CALIBRATION_FACTOR = 420.0f;

// Physical capacity of the hopper in grams when filled to the design line.
// Used as the 100% reference ONLY when no full-hopper calibration has been
// persisted via the "Calibrate full weight" command (storage.h). Once
// calibrate_full is run with the hopper genuinely full, this constant is
// superseded by the measured value stored in NVS.
constexpr float HOPPER_CAPACITY_G = 2000.0f;

// ─── Closed-loop dispensing ──────────────────────────────────────────────────
// How often the dispense loop takes a scale reading to check progress.
// Each call blocks ~800 ms, so this sets the minimum inter-check pause ON TOP
// of that blocking time (total dwell ≈ DISPENSE_POLL_INTERVAL_MS + 800 ms).
constexpr uint32_t DISPENSE_POLL_INTERVAL_MS = 250;

// Safety cutoff: abort if the target weight hasn't been removed within this
// time (empty hopper, jam, miscalibrated scale, etc.).
constexpr uint32_t DISPENSE_TIMEOUT_MS = 15000;

// Extended timeout for the "empty hopper" maintenance command — runs until the
// scale reads near zero (< 5 g) or this limit expires.
constexpr uint32_t EMPTY_HOPPER_TIMEOUT_MS = 120000;  // 2 minutes

// WiFi and MQTT connection timeouts during provisioning commit test.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MQTT_CONNECT_TIMEOUT_MS =  8000;

// ─── MQTT ────────────────────────────────────────────────────────────────────
constexpr int MQTT_MAX_PACKET = 1024;

// ─── Firmware identity ───────────────────────────────────────────────────────
constexpr char FIRMWARE_VERSION[] = "2.0.0";

// BLE device name prefix — last 4 hex digits of MAC are appended at runtime.
constexpr char BLE_NAME_PREFIX[] = "Servl-";

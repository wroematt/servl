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

// ─── Timing ──────────────────────────────────────────────────────────────────
// How long to hold the BOOT button to erase credentials and reboot into
// provisioning mode.
constexpr uint32_t RESET_HOLD_MS = 3000;

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

// WiFi and MQTT connection timeouts during provisioning commit test.
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t MQTT_CONNECT_TIMEOUT_MS =  8000;

// ─── MQTT ────────────────────────────────────────────────────────────────────
// Must be large enough for the largest inbound command JSON (~150 bytes) plus
// PubSubClient header overhead.  Defined here; mqtt_conn.cpp sets it before
// including PubSubClient.h.
constexpr int MQTT_MAX_PACKET = 1024;

// ─── Firmware identity ───────────────────────────────────────────────────────
constexpr char FIRMWARE_VERSION[] = "1.4.0";

// BLE device name prefix — last 4 hex digits of MAC are appended at runtime
// so multiple units can be distinguished (e.g. "Servl-A1B2").
constexpr char BLE_NAME_PREFIX[] = "Servl-";

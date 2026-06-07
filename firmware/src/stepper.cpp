#include "stepper.h"
#include "config.h"
#include <AccelStepper.h>

// DRIVER interface mode: one STEP pulse pin + one DIR pin (matches
// A4988 / DRV8825 / TMC2208-style boards).
static AccelStepper s_stepper(AccelStepper::DRIVER, PIN_STEPPER_STEP, PIN_STEPPER_DIR);
static bool         s_enabled = false;

static void enable_driver() {
    if (s_enabled) return;
    digitalWrite(PIN_STEPPER_ENABLE, LOW);   // active-LOW: LOW = coils energised
    s_enabled = true;
    delay(2);  // brief settle time before stepping — typical driver datasheet guidance
}

void stepper_init() {
    pinMode(PIN_STEPPER_ENABLE, OUTPUT);
    digitalWrite(PIN_STEPPER_ENABLE, HIGH);  // start de-energised
    s_enabled = false;

    s_stepper.setMaxSpeed(STEPPER_MAX_SPEED_STEPS_PER_SEC);
    s_stepper.setAcceleration(STEPPER_ACCEL_STEPS_PER_SEC2);

    log_i("[stepper] Initialised — %ld full-steps/rev x %u microsteps = %ld steps/rev "
          "(%ld steps/g at current calibration)",
          (long)STEPPER_FULL_STEPS_PER_REV, STEPPER_MICROSTEPS,
          STEPPER_STEPS_PER_REV, STEPPER_STEPS_PER_GRAM);
}

void stepper_move(long steps, void (*onTick)()) {
    if (steps == 0) return;
    enable_driver();

    s_stepper.move(steps);

    uint32_t lastTick = millis();
    while (s_stepper.distanceToGo() != 0) {
        // Must be called as close to continuously as possible — this is what
        // actually emits the STEP pulses on the correct schedule.
        s_stepper.run();

        // Service other duties (e.g. mqtt_loop() to keep the broker
        // connection alive during a long rotation) on a coarse interval so
        // we don't starve run() of CPU time and cause skipped/uneven steps.
        if (onTick) {
            uint32_t now = millis();
            if (now - lastTick >= 50) {
                onTick();
                lastTick = now;
            }
        }
    }
}

void stepper_disable() {
    digitalWrite(PIN_STEPPER_ENABLE, HIGH);
    s_enabled = false;
}

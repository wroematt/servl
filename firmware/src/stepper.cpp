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

void stepper_run_until(bool (*poll)()) {
    enable_driver();

    // Constant-speed "free run" — no target distance, since we don't know in
    // advance how far we'll need to go (that's the whole point of closed-loop
    // weight feedback). setSpeed()+runSpeed() is AccelStepper's API for this,
    // as distinct from move()+run() which ramps toward a fixed target — and
    // that's precisely why THIS function has to ramp up the speed by hand
    // below: runSpeed() has no built-in acceleration, but snapping straight
    // from a standstill to STEPPER_DISPENSE_SPEED_STEPS_PER_SEC risks the
    // motor stalling/losing sync under the auger's load (felt as a jerk —
    // exactly the "not very smooth" behaviour reported on the bench). Ramp
    // from STEPPER_RAMP_START_SPEED_STEPS_PER_SEC up to cruising speed over
    // STEPPER_RAMP_MS, then hold constant for the remainder of the run.
    uint32_t rampStartedAt = millis();
    uint32_t lastSpeedAt   = 0;
    uint32_t lastPoll      = millis();

    while (true) {
        uint32_t now = millis();

        // Re-issue setSpeed() on a coarse ~20 ms cadence while ramping —
        // frequently enough for the ramp to feel continuous, but without
        // recomputing AccelStepper's step interval on every single pass
        // through this tight loop (which runs orders of magnitude faster).
        if (now - lastSpeedAt >= 20) {
            lastSpeedAt = now;
            uint32_t elapsed = now - rampStartedAt;
            if (elapsed < STEPPER_RAMP_MS) {
                float t = (float)elapsed / (float)STEPPER_RAMP_MS;
                float speed = STEPPER_RAMP_START_SPEED_STEPS_PER_SEC +
                    (STEPPER_DISPENSE_SPEED_STEPS_PER_SEC - STEPPER_RAMP_START_SPEED_STEPS_PER_SEC) * t;
                s_stepper.setSpeed(speed);
            } else {
                s_stepper.setSpeed(STEPPER_DISPENSE_SPEED_STEPS_PER_SEC);
            }
        }

        // Must be called as close to continuously as possible — same
        // requirement as run() in stepper_move() above; this is what actually
        // emits the STEP pulses on schedule.
        s_stepper.runSpeed();

        if (poll) {
            if (now - lastPoll >= DISPENSE_POLL_INTERVAL_MS) {
                lastPoll = now;
                if (poll()) break;
            }
        }
    }
}

void stepper_disable() {
    digitalWrite(PIN_STEPPER_ENABLE, HIGH);
    s_enabled = false;
}

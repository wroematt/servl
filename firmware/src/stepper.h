#pragma once
#include <Arduino.h>

// Thin wrapper around the auger drive stepper motor (STEP/DIR/ENABLE driver —
// see PIN_STEPPER_* in config.h). Owns only the low-level motion concerns
// (pins, speed/acceleration profile, enabling/disabling the driver);
// dispenser.cpp owns the gram <-> step conversion and what a "dispense" means.

// Configure the driver pins and motion profile. Call once from setup(),
// before the first stepper_move().
void stepper_init();

// Rotate the auger by `steps` (positive = dispense direction), blocking until
// the move completes. AccelStepper::run() must be called as close to
// continuously as possible for smooth, glitch-free motion, so this function
// owns the wait loop itself rather than letting the caller poll it — `onTick`
// is invoked periodically (not every iteration) so the caller can service
// other duties (e.g. mqtt_loop()) during what may be a multi-second rotation
// without materially disrupting step timing. Pass nullptr if not needed.
void stepper_move(long steps, void (*onTick)());

// Rotate the auger continuously in the dispense direction at
// STEPPER_DISPENSE_SPEED_STEPS_PER_SEC (config.h) — constant speed, no
// acceleration profile or pre-computed target distance — blocking until
// `poll` returns true. Used for closed-loop, weight-fed-back dispensing
// (dispenser.cpp) where the right stop point can't be known in advance; the
// caller alone decides when to stop.
//
// `poll` is invoked on a coarse interval (DISPENSE_POLL_INTERVAL_MS, NOT
// every iteration — reading load cells is comparatively slow and would
// disrupt step timing if invoked too often, exactly like onTick above) and
// is responsible for BOTH evaluating the stop condition AND servicing other
// duties (e.g. mqtt_loop()). See dispenser.cpp's dispense_poll() for the
// canonical example, including its own safety-timeout stop condition — a
// `poll` that never returns true runs the motor forever.
void stepper_run_until(bool (*poll)());

// De-energise the motor coils (driver ENABLE held high). There's no need to
// hold position between dispenses, and it keeps the driver/motor cool and
// saves power. The driver is re-enabled automatically at the start of the
// next stepper_move().
void stepper_disable();

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

// De-energise the motor coils (driver ENABLE held high). There's no need to
// hold position between dispenses, and it keeps the driver/motor cool and
// saves power. The driver is re-enabled automatically at the start of the
// next stepper_move().
void stepper_disable();

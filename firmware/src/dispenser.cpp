#include "dispenser.h"
#include "config.h"
#include "stepper.h"
#include "scale.h"
#include "mqtt_conn.h"   // for mqtt_loop() — keeps connection alive during dispense

static int  s_hopperPct      = 0;
static int  s_lastDispensedG = 0;
static bool s_lastRunOk      = true;

// ─── Closed-loop poll state ──────────────────────────────────────────────────
// stepper_run_until() takes a plain function pointer with no captured state
// (the embedded toolchain steers away from std::function/lambdas-with-capture
// for this kind of tight loop), so the in-flight dispense's progress lives
// here as module statics — same pattern as s_hopperPct below.
static float    s_pollStartWeightG = 0;
static float    s_pollTargetDeltaG = 0;
static uint32_t s_pollStartedAtMs  = 0;
static bool     s_pollTimedOut     = false;

static bool dispense_poll() {
    mqtt_loop();   // keep the broker connection alive during the rotation

    float droppedG = s_pollStartWeightG - scale_read_grams();
    if (droppedG >= s_pollTargetDeltaG) {
        return true;   // target reached — stop
    }

    if (millis() - s_pollStartedAtMs >= DISPENSE_TIMEOUT_MS) {
        log_e("[dispenser] Dispense timed out after %lu ms — only %.1f g of %.0f g "
              "measured. Hopper empty? Auger jammed? Scale miscalibrated?",
              (unsigned long)DISPENSE_TIMEOUT_MS, droppedG, s_pollTargetDeltaG);
        s_pollTimedOut = true;
        return true;   // safety cutoff — stop
    }

    return false;
}

void dispenser_run(int weight_g) {
    s_pollStartWeightG = scale_read_grams();
    s_pollTargetDeltaG = (float)weight_g;
    s_pollStartedAtMs  = millis();
    s_pollTimedOut     = false;

    log_i("[dispenser] Closed-loop dispense: target %d g (scale currently reads %.1f g, "
          "hopper ~%d%%)", weight_g, s_pollStartWeightG, s_hopperPct);

    // Run the auger at a constant speed until the scale confirms the target
    // weight has been removed, or the safety timeout trips. This is the
    // closed-loop replacement for TaskList #8's open-loop turns-based move —
    // "take the weight, rotate until it's dropped by the requested amount"
    // per the TaskList #9 spec, rather than trusting a pre-computed step
    // count (which can't account for auger slip, food bridging, etc).
    stepper_run_until(dispense_poll);

    // No need to hold position between dispenses — de-energise the coils to
    // keep the driver/motor cool and save power.
    stepper_disable();

    float endWeightG = scale_read_grams();
    float measuredG  = s_pollStartWeightG - endWeightG;
    if (measuredG < 0) measuredG = 0;   // sensor noise guard — never report a negative dispense

    s_lastDispensedG = (int)(measuredG + 0.5f);
    s_lastRunOk      = !s_pollTimedOut;

    // %-full is now a real measurement, not a guess: the scale already reads
    // relative to the calibrated empty-hopper baseline (0 g == empty — see
    // scale.h), so it's simply that reading as a fraction of capacity.
    s_hopperPct = (int)((endWeightG / HOPPER_CAPACITY_G) * 100.0f + 0.5f);
    s_hopperPct = constrain(s_hopperPct, 0, 100);

    if (s_pollTimedOut) {
        log_e("[dispenser] Dispense ABORTED — measured only %d g of %d g requested. "
              "Hopper now ~%d%%", s_lastDispensedG, weight_g, s_hopperPct);
    } else {
        log_i("[dispenser] Dispense complete — measured %d g (target %d g). "
              "Hopper now ~%d%%", s_lastDispensedG, weight_g, s_hopperPct);
    }
}

int dispenser_get_last_dispensed_g() {
    return s_lastDispensedG;
}

bool dispenser_last_run_ok() {
    return s_lastRunOk;
}

int dispenser_get_hopper_pct() {
    return s_hopperPct;
}

void dispenser_reset_hopper() {
    // Read straight from the scale — already baseline-relative (0 g == empty,
    // see scale.h) — rather than guessing. Replaces the old "always 100% on
    // boot" placeholder with the true measurement.
    float weightG = scale_read_grams();
    s_hopperPct = (int)((weightG / HOPPER_CAPACITY_G) * 100.0f + 0.5f);
    s_hopperPct = constrain(s_hopperPct, 0, 100);
    log_i("[dispenser] Hopper level measured from scale: ~%d%% (%.1f g)", s_hopperPct, weightG);
}

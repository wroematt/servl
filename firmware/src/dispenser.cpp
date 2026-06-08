#include "dispenser.h"
#include "config.h"
#include "stepper.h"
#include "scale.h"
#include "mqtt_conn.h"   // for mqtt_loop() — keeps connection alive during dispense
#include <math.h>        // isnan() — see "no scale present" fallback below

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

    float current = scale_read_grams();
    if (isnan(current)) {
        // No working scale (see scale_is_present()) — most likely we're in the
        // middle of the intended incremental bring-up (#8 stepper → #9 scale →
        // #10 buttons) and the load cells just aren't wired up yet, though a
        // failed sensor looks identical from here. Either way there's no
        // weight signal to watch, so the timeout is the ONLY stop condition —
        // this degrades to a bounded open-loop run purely so the auger can
        // still be exercised and observed on the bench.
        if (millis() - s_pollStartedAtMs >= DISPENSE_TIMEOUT_MS) {
            log_w("[dispenser] No scale present — ran open-loop for %lu ms and stopped "
                  "(cannot confirm how much was actually dispensed without the hopper scale)",
                  (unsigned long)DISPENSE_TIMEOUT_MS);
            s_pollTimedOut = true;
            return true;
        }
        return false;
    }

    float droppedG = s_pollStartWeightG - current;
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

    bool haveScale = !isnan(s_pollStartWeightG);
    if (haveScale) {
        log_i("[dispenser] Closed-loop dispense: target %d g (scale currently reads %.1f g, "
              "hopper ~%d%%)", weight_g, s_pollStartWeightG, s_hopperPct);
    } else {
        log_w("[dispenser] No scale present — dispensing %d g OPEN-LOOP for up to %lu ms "
              "(see scale_is_present(); cannot confirm when the target has been removed)",
              weight_g, (unsigned long)DISPENSE_TIMEOUT_MS);
    }

    // Run the auger at a constant speed until the scale confirms the target
    // weight has been removed, or the safety timeout trips. This is the
    // closed-loop replacement for TaskList #8's open-loop turns-based move —
    // "take the weight, rotate until it's dropped by the requested amount"
    // per the TaskList #9 spec, rather than trusting a pre-computed step
    // count (which can't account for auger slip, food bridging, etc). When no
    // scale is present, dispense_poll() degrades this to "rotate until the
    // safety timeout" — enough to bench-test the auger in isolation (see
    // TaskList #8/#9/#10 incremental bring-up notes above scale_init()).
    stepper_run_until(dispense_poll);

    // No need to hold position between dispenses — de-energise the coils to
    // keep the driver/motor cool and save power.
    stepper_disable();

    float endWeightG = scale_read_grams();

    if (haveScale && !isnan(endWeightG)) {
        float measuredG = s_pollStartWeightG - endWeightG;
        if (measuredG < 0) measuredG = 0;   // sensor noise guard — never report a negative dispense

        s_lastDispensedG = (int)(measuredG + 0.5f);

        // %-full is a real measurement, not a guess: the scale already reads
        // relative to the calibrated empty-hopper baseline (0 g == empty —
        // see scale.h), so it's simply that reading as a fraction of capacity.
        s_hopperPct = (int)((endWeightG / HOPPER_CAPACITY_G) * 100.0f + 0.5f);
        s_hopperPct = constrain(s_hopperPct, 0, 100);
    } else {
        // No scale (now, or for the whole run) — we genuinely don't know how
        // much left the hopper or how full it is. Report 0 g (never claim a
        // weight we didn't observe — that would corrupt feed history) and
        // leave hopper_pct at its last-known value rather than computing
        // garbage from a NAN.
        s_lastDispensedG = 0;
        log_w("[dispenser] No scale present — cannot measure dispensed weight or hopper "
              "level (reporting 0 g measured; hopper_pct stays at its last known ~%d%%)",
              s_hopperPct);
    }

    s_lastRunOk = !s_pollTimedOut;

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
    if (isnan(weightG)) {
        // No scale present (see scale_is_present()) — leave hopper_pct at
        // whatever it last was (0 on a fresh boot) rather than computing
        // garbage from a NAN. This is expected mid-bring-up, when only the
        // stepper (#8) is wired and the scale (#9) isn't connected yet.
        log_w("[dispenser] No scale present — hopper level unavailable, leaving at ~%d%%",
              s_hopperPct);
        return;
    }
    s_hopperPct = (int)((weightG / HOPPER_CAPACITY_G) * 100.0f + 0.5f);
    s_hopperPct = constrain(s_hopperPct, 0, 100);
    log_i("[dispenser] Hopper level measured from scale: ~%d%% (%.1f g)", s_hopperPct, weightG);
}

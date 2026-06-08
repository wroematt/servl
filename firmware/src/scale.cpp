#include "scale.h"
#include "config.h"
#include "storage.h"
#include <HX711.h>
#include <math.h>

static HX711 s_scale;

// Set once in scale_init(): true only if the HX711 actually responded within
// SCALE_READY_TIMEOUT_MS. Everything else in this module is gated on it —
// see scale_is_present().
static bool s_scalePresent = false;

// Poll is_ready() with a bounded wait. The underlying HX711 library's
// read()/tare()/get_units() loop on is_ready() with NO timeout of their own —
// fine when the chip is wired up, but an indefinite hang in setup()/loop() if
// it isn't (no chip yet during incremental hardware bring-up, a disconnected
// harness, a dead sensor in the field). This is what bounds that wait so the
// rest of the firmware can keep running in a "scale absent" degraded mode
// instead of bricking. Returns true once a conversion is ready, false on timeout.
static bool scale_wait_ready(uint32_t timeoutMs) {
    uint32_t start = millis();
    while (!s_scale.is_ready()) {
        if (millis() - start >= timeoutMs) return false;
        delay(10);
    }
    return true;
}

void scale_init() {
    s_scale.begin(PIN_SCALE_DOUT, PIN_SCALE_SCK);
    s_scale.set_scale(SCALE_CALIBRATION_FACTOR);

    // Confirm the chip is actually there before doing anything that would
    // otherwise block forever (tare(), get_units()). This is what lets the
    // intended incremental bring-up order — wire + test the stepper (#8),
    // THEN the scale (#9), THEN the buttons (#10) — actually work: booting
    // with only the stepper connected must not hang here.
    s_scalePresent = scale_wait_ready(SCALE_READY_TIMEOUT_MS);
    if (!s_scalePresent) {
        log_e("[scale] No response from HX711 within %lu ms on DOUT=GPIO%d/SCK=GPIO%d — "
              "hopper scale not present or not wired yet. Continuing WITHOUT weight "
              "feedback: dispenses will run open-loop until DISPENSE_TIMEOUT_MS and "
              "hopper_pct will stay at its last-known placeholder value. Wire up the "
              "load cells and reboot to restore real readings.",
              (unsigned long)SCALE_READY_TIMEOUT_MS, PIN_SCALE_DOUT, PIN_SCALE_SCK);
        return;
    }

    if (storage_has_scale_offset()) {
        long offset = storage_load_scale_offset();
        s_scale.set_offset(offset);
        log_i("[scale] Restored empty-hopper baseline from NVS (raw offset %ld)", offset);
    } else {
        log_w("[scale] No empty-hopper baseline stored yet — taring now and treating the "
              "CURRENT load as empty. This is only correct on a brand-new unit that has "
              "never had food in its hopper! If that's not the case, hold BOOT for "
              "%lu-%lu ms once the hopper genuinely is empty to recalibrate.",
              (unsigned long)CALIBRATE_HOLD_MS, (unsigned long)RESET_HOLD_MS);

        // Safe to call now — scale_wait_ready() above already confirmed the
        // chip responds, so this won't block indefinitely.
        s_scale.tare(SCALE_SAMPLES);
        storage_save_scale_offset(s_scale.get_offset());
    }

    log_i("[scale] Initialised — %.1f counts/g, %.0f g hopper capacity",
          SCALE_CALIBRATION_FACTOR, HOPPER_CAPACITY_G);
}

bool scale_is_present() {
    return s_scalePresent;
}

bool scale_is_ready() {
    return s_scalePresent && s_scale.is_ready();
}

float scale_read_grams() {
    // Re-check liveness (bounded) rather than trusting the boot-time result
    // forever — a chip that was present at boot can still drop off later
    // (loose harness, etc), and this is the one guard that keeps that from
    // turning into another indefinite block in get_units().
    if (!s_scalePresent || !scale_wait_ready(SCALE_READY_TIMEOUT_MS)) {
        s_scalePresent = false;
        return NAN;
    }
    return s_scale.get_units(SCALE_SAMPLES);
}

void scale_recalibrate_empty() {
    if (!s_scalePresent) {
        log_w("[scale] Cannot recalibrate — no scale present");
        return;
    }
    log_w("[scale] Recalibrating empty-hopper baseline — taring against the load on the "
          "platform right now. (Make sure the hopper is ACTUALLY empty — this overwrites "
          "the previous baseline.)");
    s_scale.tare(SCALE_SAMPLES);
    long offset = s_scale.get_offset();
    storage_save_scale_offset(offset);
    log_i("[scale] New empty-hopper baseline stored (raw offset %ld)", offset);
}

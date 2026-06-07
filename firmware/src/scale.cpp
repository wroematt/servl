#include "scale.h"
#include "config.h"
#include "storage.h"
#include <HX711.h>

static HX711 s_scale;

void scale_init() {
    s_scale.begin(PIN_SCALE_DOUT, PIN_SCALE_SCK);
    s_scale.set_scale(SCALE_CALIBRATION_FACTOR);

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

        // Block briefly for the chip to report its first conversion. Acceptable
        // only here, in setup(), before the state machine starts running —
        // everywhere else a blocking scale read would disrupt step timing or
        // stall the loop (see stepper_run_until()'s coarse polling).
        uint32_t waitStart = millis();
        while (!s_scale.is_ready() && millis() - waitStart < 5000) {
            delay(10);
        }
        s_scale.tare(SCALE_SAMPLES);
        storage_save_scale_offset(s_scale.get_offset());
    }

    log_i("[scale] Initialised — %.1f counts/g, %.0f g hopper capacity",
          SCALE_CALIBRATION_FACTOR, HOPPER_CAPACITY_G);
}

bool scale_is_ready() {
    return s_scale.is_ready();
}

float scale_read_grams() {
    return s_scale.get_units(SCALE_SAMPLES);
}

void scale_recalibrate_empty() {
    log_w("[scale] Recalibrating empty-hopper baseline — taring against the load on the "
          "platform right now. (Make sure the hopper is ACTUALLY empty — this overwrites "
          "the previous baseline.)");
    s_scale.tare(SCALE_SAMPLES);
    long offset = s_scale.get_offset();
    storage_save_scale_offset(offset);
    log_i("[scale] New empty-hopper baseline stored (raw offset %ld)", offset);
}

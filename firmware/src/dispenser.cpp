#include "dispenser.h"
#include "config.h"
#include "scale.h"
#include "storage.h"
#include "mqtt_conn.h"
#include <ESP32Servo.h>
#include <math.h>

static Servo s_servo;
static int   s_hopperPct      = 0;
static int   s_lastDispensedG = 0;
static bool  s_lastRunOk      = true;

// Returns the full-hopper reference weight: persisted calibration value when
// available (scale_calibrate_full() has been run with a full hopper), otherwise
// the fixed HOPPER_CAPACITY_G constant from config.h.
static float full_weight_g() {
    if (storage_has_full_weight()) {
        float fw = storage_load_full_weight();
        if (fw > 0.0f) return fw;
    }
    return HOPPER_CAPACITY_G;
}

static void update_hopper_pct(float grams) {
    float fw = full_weight_g();
    s_hopperPct = (int)((grams / fw) * 100.0f + 0.5f);
    s_hopperPct = constrain(s_hopperPct, 0, 100);
}

static void vibration_set(uint8_t duty) {
    ledcWrite(VIBRATION_LEDC_CHANNEL, duty);
}

// Read the INA169 current sensor (raw 12-bit ADC, 0–4095).
static int read_current_raw() {
    return analogRead(PIN_CURRENT_SENSE);
}

// Read the servo position feedback potentiometer (raw 12-bit ADC, 0–4095).
static int read_position_raw() {
    return analogRead(PIN_SERVO_FEEDBACK);
}

// Convert a servo angle (degrees) to the expected raw ADC count from the
// position feedback pot, using linear interpolation over the full 0°–180° range.
//   V(θ) = V_0 + θ/180 × (V_180 − V_0)
//   ADC  = V / 3.3 × 4095
static int expected_position_adc(int angleDeg) {
    float v = SERVO_FEEDBACK_V_AT_0DEG +
              (float)angleDeg / 180.0f *
              (SERVO_FEEDBACK_V_AT_180DEG - SERVO_FEEDBACK_V_AT_0DEG);
    return (int)(v / 3.3f * 4095.0f + 0.5f);
}

// Jam detection: true if either the INA169 or position feedback indicates the
// servo is being held back by a physical obstruction.
static bool is_jammed(int commandedDeg) {
    int currentRaw = read_current_raw();
    int posRaw     = read_position_raw();
    int posThresh  = expected_position_adc(commandedDeg - JAM_POSITION_TOLERANCE_DEG);

    bool jamCurrent  = (currentRaw > JAM_CURRENT_THRESHOLD);
    bool jamPosition = (posRaw < posThresh);

    if (jamCurrent) {
        log_w("[dispenser] Jam — high current: %d (threshold %d)", currentRaw, JAM_CURRENT_THRESHOLD);
    }
    if (jamPosition) {
        log_w("[dispenser] Jam — position %d below %d° threshold (ADC %d)",
              posRaw, commandedDeg - JAM_POSITION_TOLERANCE_DEG, posThresh);
    }
    return jamCurrent || jamPosition;
}

// Attempt to clear a kibble jam: close the chute slightly, run the vibration
// motor at full power to dislodge the blockage, then reopen.
static void clear_jam() {
    log_w("[dispenser] Jam detected — running clearance cycle");
    int partial = SERVO_OPEN_DEG - JAM_CLEAR_CLOSE_DEG;
    if (partial < 0) partial = 0;

    s_servo.write(partial);
    vibration_set(VIBRATION_DUTY_JAM_CLEAR);
    delay((uint32_t)JAM_CLEAR_CYCLES * JAM_CLEAR_HALF_PERIOD_MS * 2);
    vibration_set(VIBRATION_DUTY_DISPENSE);

    s_servo.write(SERVO_OPEN_DEG);
    delay(200);
}

// Core chute loop: open the servo, run the vibration motor, poll the scale
// until the stop condition is met, then stop the motor and close the servo.
//
//   startW        — scale reading taken BEFORE opening (grams above empty baseline).
//                   Pass NAN if the scale is absent; in that case the loop runs
//                   open-loop until timeout_ms.
//   weightTarget  — if > 0: stop when (startW - currentW) >= weightTarget (dispense mode).
//                   if == 0: stop when currentW < 5 g (empty-hopper mode).
//   timeout_ms    — absolute upper bound on run time.
//
// Returns true if the stop condition was met before the timeout.
static bool run_chute(float startW, float weightTarget, uint32_t timeout_ms) {
    bool haveScale = !isnan(startW);

    s_servo.write(SERVO_OPEN_DEG);
    delay(SERVO_OPEN_SETTLE_MS);
    vibration_set(VIBRATION_DUTY_DISPENSE);

    uint32_t startMs       = millis();
    uint32_t lastScaleMs   = millis();
    uint32_t lastMqttMs    = millis();
    uint32_t lastCurrentMs = millis();
    bool     timedOut      = false;

    while (true) {
        uint32_t now = millis();

        // MQTT keepalive.
        if (now - lastMqttMs >= 200) {
            lastMqttMs = now;
            mqtt_loop();
        }

        // Jam detection: check both INA169 current and servo position feedback.
        if (now - lastCurrentMs >= CURRENT_POLL_INTERVAL_MS) {
            lastCurrentMs = now;
            if (is_jammed(SERVO_OPEN_DEG)) {
                clear_jam();
                lastCurrentMs = millis();
            }
        }

        // Scale check (blocks ~800 ms for SCALE_SAMPLES readings).
        if (now - lastScaleMs >= DISPENSE_POLL_INTERVAL_MS) {
            float curW = scale_read_grams();
            lastScaleMs = millis();  // update AFTER the blocking read

            if (haveScale && !isnan(curW)) {
                if (weightTarget > 0.0f) {
                    // Dispense mode: stop when enough weight has been removed.
                    if ((startW - curW) >= weightTarget) break;
                } else {
                    // Empty-hopper mode: stop when the hopper reads near zero.
                    if (curW < 5.0f) break;
                }
            }
        }

        // Safety cutoff.
        if (millis() - startMs >= timeout_ms) {
            timedOut = true;
            break;
        }
    }

    vibration_set(0);
    s_servo.write(SERVO_CLOSED_DEG);
    delay(SERVO_CLOSE_SETTLE_MS);

    return !timedOut;
}

void dispenser_init() {
    s_servo.attach(PIN_SERVO);
    s_servo.write(SERVO_CLOSED_DEG);

    // Configure ADC for the INA169 current sensor and servo position feedback
    // (both need 0–3.3 V range with 12-bit resolution).
    analogReadResolution(12);
    analogSetPinAttenuation(PIN_CURRENT_SENSE,  ADC_11db);
    analogSetPinAttenuation(PIN_SERVO_FEEDBACK, ADC_11db);

    // Vibration motor — LEDC PWM output, motor off at startup.
    ledcSetup(VIBRATION_LEDC_CHANNEL, VIBRATION_LEDC_FREQ_HZ, VIBRATION_LEDC_RESOLUTION);
    ledcAttachPin(PIN_VIBRATION_MOTOR, VIBRATION_LEDC_CHANNEL);
    vibration_set(0);
}

void dispenser_run(int weight_g) {
    float startW    = scale_read_grams();
    bool  haveScale = !isnan(startW);

    if (haveScale) {
        log_i("[dispenser] Servo dispense: target %d g (scale %.1f g, hopper ~%d%%)",
              weight_g, startW, s_hopperPct);
    } else {
        log_w("[dispenser] No scale — dispensing %d g open-loop for up to %lu ms",
              weight_g, (unsigned long)DISPENSE_TIMEOUT_MS);
    }

    bool ok = run_chute(startW, (float)weight_g, DISPENSE_TIMEOUT_MS);
    s_lastRunOk = ok;

    float endW = scale_read_grams();
    if (haveScale && !isnan(endW)) {
        float measured = startW - endW;
        if (measured < 0) measured = 0;
        s_lastDispensedG = (int)(measured + 0.5f);
        update_hopper_pct(endW);
    } else {
        s_lastDispensedG = 0;
        log_w("[dispenser] No scale — reporting 0 g measured; hopper_pct stays at ~%d%%",
              s_hopperPct);
    }

    if (!ok) {
        log_e("[dispenser] Dispense ABORTED — measured %d g of %d g requested. Hopper ~%d%%",
              s_lastDispensedG, weight_g, s_hopperPct);
    } else {
        log_i("[dispenser] Dispense complete — measured %d g (target %d g). Hopper ~%d%%",
              s_lastDispensedG, weight_g, s_hopperPct);
    }
}

void dispenser_empty_hopper() {
    log_w("[dispenser] Empty-hopper command — opening chute until scale reads < 5 g "
          "or %lu ms timeout", (unsigned long)EMPTY_HOPPER_TIMEOUT_MS);

    float startW = scale_read_grams();
    run_chute(startW, 0.0f, EMPTY_HOPPER_TIMEOUT_MS);

    // Force hopper to 0% regardless of what the scale now reads.
    s_hopperPct      = 0;
    s_lastDispensedG = 0;
    s_lastRunOk      = true;
    log_i("[dispenser] Empty-hopper complete");
}

int  dispenser_get_last_dispensed_g() { return s_lastDispensedG; }
bool dispenser_last_run_ok()           { return s_lastRunOk; }
int  dispenser_get_hopper_pct()        { return s_hopperPct; }

void dispenser_reset_hopper() {
    float weightG = scale_read_grams();
    if (isnan(weightG)) {
        log_w("[dispenser] No scale — hopper level unavailable, leaving at ~%d%%", s_hopperPct);
        return;
    }
    update_hopper_pct(weightG);
    log_i("[dispenser] Hopper level measured from scale: ~%d%% (%.1f g of %.0f g capacity)",
          s_hopperPct, weightG, full_weight_g());
}

#include "dispenser.h"
#include "config.h"
#include "stepper.h"
#include "mqtt_conn.h"   // for mqtt_loop() — keeps connection alive during dispense

static int s_hopperPct = 100;

void dispenser_run(int weight_g) {
    long steps = (long)weight_g * STEPPER_STEPS_PER_GRAM;

    log_i("[dispenser] Dispensing %d g  (%ld steps @ %ld steps/g, hopper currently ~%d%%)",
          weight_g, steps, STEPPER_STEPS_PER_GRAM, s_hopperPct);

    // Drive the auger. stepper_move() pumps mqtt_loop() periodically (via the
    // onTick callback) so the broker connection survives what can be a
    // multi-second rotation for larger portions.
    stepper_move(steps, mqtt_loop);

    // No need to hold position between dispenses — de-energise the coils to
    // keep the driver/motor cool and save power.
    stepper_disable();

    // Hopper estimate: -1 % per gram, floored at 0. This is an open-loop
    // guess with no relationship to how much food is actually left — it's a
    // placeholder until the load-cell hopper scale (TaskList #9) provides a
    // real measurement referenced against a calibrated empty-hopper baseline.
    s_hopperPct = max(0, s_hopperPct - weight_g);

    log_i("[dispenser] Dispense complete. Hopper now: ~%d%% (estimated, no load cells yet)", s_hopperPct);
}

int dispenser_get_hopper_pct() {
    return s_hopperPct;
}

void dispenser_reset_hopper() {
    s_hopperPct = 100;
    log_i("[dispenser] Hopper estimate reset to 100%%");
}

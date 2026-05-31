#include "dispenser.h"
#include "config.h"
#include "mqtt_conn.h"   // for mqtt_loop() — keeps connection alive during dispense

static int s_hopperPct = 100;

void dispenser_run(int weight_g) {
    log_i("[dispenser] Starting simulated dispense: %d g  hopper: %d%%",
          weight_g, s_hopperPct);

    for (int i = 0; i < weight_g; i++) {
        digitalWrite(PIN_LED, HIGH);
        delay(FLASH_ON_MS);
        digitalWrite(PIN_LED, LOW);
        delay(FLASH_OFF_MS);

        // Keep the MQTT connection alive during the (potentially long) flash loop.
        mqtt_loop();
    }

    // Update virtual hopper: 1% per gram, floor at 0.
    s_hopperPct = max(0, s_hopperPct - weight_g);

    log_i("[dispenser] Dispense complete. Hopper now: %d%%", s_hopperPct);
}

int dispenser_get_hopper_pct() {
    return s_hopperPct;
}

void dispenser_reset_hopper() {
    s_hopperPct = 100;
    log_i("[dispenser] Hopper reset to 100%%");
}

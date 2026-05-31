#include "led_status.h"
#include "config.h"

// Initialise to OFF so the very first led_status_set() call always enters the
// if-branch and resets the timer correctly (if we initialised to PROVISIONING,
// calling led_status_set(PROVISIONING) in setup() would be a no-op and the
// blink timer would never be initialised, leaving the LED stuck on permanently).
static LedState  s_state      = LedState::OFF;
static uint32_t  s_lastChange = 0;
static bool      s_ledOn      = false;

void led_status_set(LedState state) {
    if (state != s_state) {
        s_state      = state;
        s_lastChange = 0;   // force immediate evaluation on next led_status_update()
        s_ledOn      = false;
        digitalWrite(PIN_LED, LOW);
    }
}

void led_status_update() {
    if (s_state == LedState::OFF) {
        // Dispensing task controls the LED directly; we stay out of the way.
        return;
    }

    uint32_t now = millis();

    // Determine on/off durations based on current state.
    uint32_t onMs, offMs;
    switch (s_state) {
        case LedState::PROVISIONING:    onMs = 500;  offMs = 500;  break;
        case LedState::WIFI_CONNECTING: onMs = 100;  offMs = 100;  break;
        case LedState::MQTT_CONNECTING: onMs = 200;  offMs = 200;  break;
        case LedState::OPERATIONAL:     onMs = 50;   offMs = 4950; break;
        default:                        onMs = 500;  offMs = 500;  break;
    }

    uint32_t elapsed = now - s_lastChange;
    uint32_t threshold = s_ledOn ? onMs : offMs;

    if (elapsed >= threshold) {
        s_ledOn = !s_ledOn;
        digitalWrite(PIN_LED, s_ledOn ? HIGH : LOW);
        s_lastChange = now;
    }
}

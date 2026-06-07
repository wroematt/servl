#include "config.h"
#include "buttons.h"

// ─── Per-button debounced double-click state ─────────────────────────────────
//
// Detection strategy: count debounced press edges (HIGH→LOW transitions, since
// the buttons are active-LOW). If a press edge follows the previous press edge
// within DOUBLE_CLICK_WINDOW_MS, it's the second click of a double-click — fire
// immediately (no need to wait for a release or a "no third click" timeout;
// a feed is either requested or it isn't, and faster feedback reads better).
// Anything else — a lone press, or a press that arrives too late — just resets
// the counter to 1 and starts a new window.
struct ButtonState {
    uint8_t  pin;
    bool     debouncedPressed;  // last accepted (debounced) pressed state
    uint32_t lastEdgeAt;        // millis() of the last raw level change (debounce timer)
    uint32_t lastClickAt;       // millis() of the last accepted press edge
    uint8_t  clickCount;        // 0 = idle, 1 = waiting for a possible second click
};

static ButtonState s_meal  = { PIN_BUTTON_MEAL,  false, 0, 0, 0 };
static ButtonState s_snack = { PIN_BUTTON_SNACK, false, 0, 0, 0 };

// Returns true exactly when this poll detects the qualifying second click of
// a double-click on this specific button.
static bool poll_one(ButtonState& btn, uint32_t now) {
    bool rawPressed = (digitalRead(btn.pin) == LOW);  // active LOW

    if (rawPressed != btn.debouncedPressed) {
        // Level differs from our last accepted state — start/continue timing
        // how long it's been stable. lastEdgeAt is reset on every raw change,
        // so only a level that holds steady for BUTTON_DEBOUNCE_MS gets accepted.
        if (btn.lastEdgeAt == 0) {
            btn.lastEdgeAt = now;
        } else if (now - btn.lastEdgeAt >= BUTTON_DEBOUNCE_MS) {
            btn.debouncedPressed = rawPressed;
            btn.lastEdgeAt       = 0;

            if (btn.debouncedPressed) {
                // Debounced press edge.
                if (btn.clickCount == 1 && (now - btn.lastClickAt) <= DOUBLE_CLICK_WINDOW_MS) {
                    // Second click landed inside the window — qualifying double-click.
                    btn.clickCount = 0;
                    btn.lastClickAt = now;
                    return true;
                }
                // First click of a (possible) pair — start the window.
                btn.clickCount  = 1;
                btn.lastClickAt = now;
            }
        }
    } else {
        // Level matches our debounced state again — the change we were timing
        // was just a blip (or there's no change in flight). Cancel the timer.
        btn.lastEdgeAt = 0;
    }

    // A first click that's gone stale (no second click arrived within the
    // window) stops being eligible to pair with a future press.
    if (btn.clickCount == 1 && (now - btn.lastClickAt) > DOUBLE_CLICK_WINDOW_MS) {
        btn.clickCount = 0;
    }

    return false;
}

void buttons_init() {
    pinMode(PIN_BUTTON_MEAL,  INPUT_PULLUP);
    pinMode(PIN_BUTTON_SNACK, INPUT_PULLUP);
    log_i("[buttons] Meal=GPIO%d Snack=GPIO%d (active LOW, double-click window %lums)",
          PIN_BUTTON_MEAL, PIN_BUTTON_SNACK, (unsigned long)DOUBLE_CLICK_WINDOW_MS);
}

bool buttons_poll(ButtonId* outWhich) {
    uint32_t now = millis();

    if (poll_one(s_meal, now)) {
        if (outWhich) *outWhich = ButtonId::MEAL;
        return true;
    }
    if (poll_one(s_snack, now)) {
        if (outWhich) *outWhich = ButtonId::SNACK;
        return true;
    }
    return false;
}

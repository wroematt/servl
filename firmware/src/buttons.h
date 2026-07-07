#pragma once
#include <Arduino.h>

// ─── Physical Meal/Snack feed buttons (see TaskList #10) ────────────────────
//
// "two buttons on the device will act as Meal and Snack feed buttons. To
// trigger a feed the button must be double clicked to make it difficult for
// a pet to learn."
//
// This module owns both buttons' GPIO state and double-click detection. It
// deliberately does NOT know anything about MQTT, pets, or weights — it just
// answers the question "did a qualifying double-click just happen, and on
// which button?" main.cpp wires the answer to mqtt_publish_button_press().
//
// Both buttons are wired active-LOW with the ESP32's internal pull-ups
// enabled (pressed = LOW), exactly like PIN_BUTTON (BOOT) elsewhere in this
// firmware — no external pull-up/down resistors required.

enum class ButtonId {
    MEAL,
    SNACK,
};

// Configure GPIOs (INPUT_PULLUP). Call once from setup().
void buttons_init();

// Poll both buttons for a debounced double-click. Call on every loop()
// iteration. Returns true at most once per qualifying double-click — single
// presses, long holds, and contact bounce are all filtered out and never
// produce a true result. When true is returned, *outWhich identifies which
// button fired (if outWhich is non-null).
bool buttons_poll(ButtonId* outWhich);

// Discard any pending click state on both buttons. Call after a combo-hold
// action fires so that releasing the buttons doesn't leave a stale half-click
// that could pair with the next press into an accidental double-click.
void buttons_cancel();

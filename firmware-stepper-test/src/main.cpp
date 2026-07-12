#include <Arduino.h>
#include <AccelStepper.h>

// ── Pin assignments ───────────────────────────────────────────────────────────
// Connect your stepper driver STEP, DIR, and ENABLE lines to these GPIOs.
// These are the same pins used in the original Servl stepper firmware —
// change them here if your prototype is wired differently.
constexpr uint8_t PIN_STEP   = 25;
constexpr uint8_t PIN_DIR    = 33;
constexpr uint8_t PIN_ENABLE = 32;   // active LOW on most common drivers (A4988, DRV8825)

// ── Motion parameters ─────────────────────────────────────────────────────────
// Adjust these two constants to match your hardware:
//   STEPS_PER_REV  — full steps per revolution of your motor (200 = 1.8° stepper)
//   MICROSTEP      — microstepping divisor set on your driver's MS pins
//                    common values: 1 (full), 2, 4, 8, 16, 32
constexpr float   STEPS_PER_REV = 200.0f;
constexpr uint8_t MICROSTEP     = 8;

constexpr float USTEPS_PER_REV = STEPS_PER_REV * MICROSTEP;
constexpr float RPM_START       = 60.0f;
constexpr float RPM_MIN         = 5.0f;
constexpr float RPM_STEP        = 10.0f;   // amount +/- adjusts per keypress

static float s_rpm = RPM_START;
static int   s_dir = 1;   // 1 = forward, -1 = reverse

static AccelStepper stepper(AccelStepper::DRIVER, PIN_STEP, PIN_DIR);

static float rpm_to_usteps_per_sec(float rpm) {
    return (rpm / 60.0f) * USTEPS_PER_REV;
}

static void apply_speed() {
    float sps = rpm_to_usteps_per_sec(s_rpm);
    stepper.setMaxSpeed(sps);
    stepper.setSpeed(sps * (float)s_dir);
}

static void print_status() {
    float sps = rpm_to_usteps_per_sec(s_rpm);
    Serial.printf("  %.1f RPM  |  %.0f usteps/s  |  direction: %s\n",
                  s_rpm, sps, s_dir > 0 ? "forward" : "reverse");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(PIN_ENABLE, OUTPUT);
    digitalWrite(PIN_ENABLE, LOW);   // enable driver

    stepper.setAcceleration(0);
    apply_speed();

    Serial.println();
    Serial.println("────────────────────────────────────────");
    Serial.println("  Servl stepper test");
    Serial.println("────────────────────────────────────────");
    Serial.printf("  STEP=GPIO%d  DIR=GPIO%d  EN=GPIO%d\n", PIN_STEP, PIN_DIR, PIN_ENABLE);
    Serial.printf("  %d steps/rev  x%d microstep  =  %.0f usteps/rev\n",
                  (int)STEPS_PER_REV, MICROSTEP, USTEPS_PER_REV);
    Serial.println();
    Serial.println("  Commands (send via serial monitor):");
    Serial.println("    +   speed up by 10 RPM");
    Serial.println("    -   slow down by 10 RPM");
    Serial.println("    r   reverse direction");
    Serial.println("    s   stop / start toggle");
    Serial.println("    ?   print current speed");
    Serial.println("────────────────────────────────────────");
    print_status();
    Serial.println();
}

static bool s_running = true;

void loop() {
    if (s_running) {
        stepper.runSpeed();
    }

    if (!Serial.available()) return;

    char c = Serial.read();
    switch (c) {
        case '+':
            s_rpm += RPM_STEP;
            apply_speed();
            Serial.print("Speed up → ");
            print_status();
            break;

        case '-':
            s_rpm = max(RPM_MIN, s_rpm - RPM_STEP);
            apply_speed();
            Serial.print("Speed down → ");
            print_status();
            break;

        case 'r':
        case 'R':
            s_dir = -s_dir;
            apply_speed();
            Serial.print("Reversed → ");
            print_status();
            break;

        case 's':
        case 'S':
            s_running = !s_running;
            if (!s_running) {
                stepper.stop();
                Serial.println("Stopped.");
            } else {
                apply_speed();
                Serial.print("Running → ");
                print_status();
            }
            break;

        case '?':
            print_status();
            break;

        default:
            break;
    }
}

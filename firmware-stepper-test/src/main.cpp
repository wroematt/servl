#include <Arduino.h>
#include <AccelStepper.h>

// ── Pin assignments ───────────────────────────────────────────────────────────
constexpr uint8_t PIN_STEP   = 25;
constexpr uint8_t PIN_DIR    = 33;
constexpr uint8_t PIN_ENABLE = 32;   // active LOW on most common drivers (A4988, DRV8825)

// ── Motion parameters ─────────────────────────────────────────────────────────
// STEPS_PER_REV  — full steps per motor revolution (200 = 1.8° stepper)
// MICROSTEP      — microstepping divisor set on driver MS pins (1, 2, 4, 8, 16, 32)
// ACCEL_RPM_S    — how quickly the motor ramps up/down in RPM per second.
//                  Lower = gentler ramp, less likely to stall at higher speeds.
//                  Higher = snappier but may stall on the ramp if set too aggressively.
constexpr float   STEPS_PER_REV = 200.0f;
constexpr uint8_t MICROSTEP     = 8;
constexpr float   ACCEL_RPM_S   = 30.0f;   // RPM gained per second during ramp

constexpr float USTEPS_PER_REV  = STEPS_PER_REV * MICROSTEP;
constexpr float RPM_START        = 60.0f;
constexpr float RPM_MIN          = 5.0f;
constexpr float RPM_STEP         = 10.0f;

// Large move target refreshed continuously so the motor never reaches it —
// AccelStepper needs a finite target to apply acceleration, unlike runSpeed().
constexpr long MOVE_CHUNK = 500000L;

static float s_rpm     = RPM_START;
static int   s_dir     = 1;   // 1 = forward, -1 = reverse
static bool  s_running = true;

static AccelStepper stepper(AccelStepper::DRIVER, PIN_STEP, PIN_DIR);

static float rpm_to_sps(float rpm) {
    return (rpm / 60.0f) * USTEPS_PER_REV;
}

static float accel_sps2() {
    return (ACCEL_RPM_S / 60.0f) * USTEPS_PER_REV;
}

// Point the move target far ahead in the current direction. Called on start
// and whenever the remaining distance drops below a threshold.
static void push_target() {
    stepper.moveTo(stepper.currentPosition() + MOVE_CHUNK * (long)s_dir);
}

static void apply_speed() {
    stepper.setMaxSpeed(rpm_to_sps(s_rpm));
    stepper.setAcceleration(accel_sps2());
    if (s_running) push_target();
}

static void print_status() {
    Serial.printf("  %.1f RPM  |  %.0f usteps/s  |  accel %.0f RPM/s  |  %s\n",
                  s_rpm, rpm_to_sps(s_rpm), ACCEL_RPM_S,
                  s_dir > 0 ? "forward" : "reverse");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(PIN_ENABLE, OUTPUT);
    digitalWrite(PIN_ENABLE, LOW);   // enable driver

    stepper.setMaxSpeed(rpm_to_sps(s_rpm));
    stepper.setAcceleration(accel_sps2());
    push_target();

    Serial.println();
    Serial.println("────────────────────────────────────────");
    Serial.println("  Servl stepper test");
    Serial.println("────────────────────────────────────────");
    Serial.printf("  STEP=GPIO%d  DIR=GPIO%d  EN=GPIO%d\n", PIN_STEP, PIN_DIR, PIN_ENABLE);
    Serial.printf("  %d steps/rev  x%d microstep  =  %.0f usteps/rev\n",
                  (int)STEPS_PER_REV, MICROSTEP, USTEPS_PER_REV);
    Serial.println();
    Serial.println("  Commands:");
    Serial.println("    +   speed up 10 RPM");
    Serial.println("    -   slow down 10 RPM");
    Serial.println("    r   reverse (decelerates, then re-accelerates)");
    Serial.println("    s   stop / start toggle (decelerates to stop)");
    Serial.println("    ?   print current speed");
    Serial.println("────────────────────────────────────────");
    print_status();
    Serial.println();
}

void loop() {
    if (s_running) {
        // Refresh the target before we get close — keeps the motor running
        // indefinitely without ever actually reaching the position.
        if (abs(stepper.distanceToGo()) < 50000) {
            push_target();
        }
        stepper.run();
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
            // moveTo() a large target in the new direction — AccelStepper will
            // decelerate, pass through zero, and re-accelerate automatically.
            push_target();
            Serial.print("Reversing → ");
            print_status();
            break;

        case 's':
        case 'S':
            s_running = !s_running;
            if (!s_running) {
                stepper.stop();   // decelerates to a controlled stop
                Serial.println("Stopping (decelerating)...");
            } else {
                push_target();
                Serial.print("Starting → ");
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

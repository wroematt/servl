#include <Arduino.h>
#include <AccelStepper.h>

// ── Pin assignments ───────────────────────────────────────────────────────────
constexpr uint8_t PIN_STEP   = 25;
constexpr uint8_t PIN_DIR    = 33;
constexpr uint8_t PIN_ENABLE = 32;   // active LOW (A4988, DRV8825)

// ── Motion parameters ─────────────────────────────────────────────────────────
constexpr float   STEPS_PER_REV = 200.0f;  // 200 = 1.8° stepper
constexpr uint8_t MICROSTEP     = 8;        // match driver MS pin settings
constexpr float   ACCEL_RPM_S   = 30.0f;   // RPM gained per second during ramp

constexpr float    USTEPS_PER_REV   = STEPS_PER_REV * MICROSTEP;
constexpr float    RPM_START         = 60.0f;
constexpr float    RPM_MIN           = 5.0f;
constexpr float    RPM_STEP          = 10.0f;
constexpr uint32_t ACCEL_INTERVAL_MS = 10;  // ramp tick — speed updated every 10 ms

static float    s_rpm          = RPM_START;
static int      s_dir          = 1;      // 1 = forward, -1 = reverse
static bool     s_running      = true;
static float    s_currentSpeed = 0.0f;  // actual speed sent to driver (usteps/s, signed)
static float    s_targetSpeed  = 0.0f;  // desired speed (usteps/s, signed)
static uint32_t s_lastAccelMs  = 0;

static AccelStepper stepper(AccelStepper::DRIVER, PIN_STEP, PIN_DIR);

static float rpm_to_sps(float rpm) {
    return (rpm / 60.0f) * USTEPS_PER_REV;
}

// usteps/s to add or subtract each ramp tick to achieve ACCEL_RPM_S
static float accel_per_tick() {
    return (ACCEL_RPM_S / 60.0f) * USTEPS_PER_REV * (ACCEL_INTERVAL_MS / 1000.0f);
}

static void update_target() {
    s_targetSpeed = s_running ? rpm_to_sps(s_rpm) * (float)s_dir : 0.0f;
}

static void print_status() {
    Serial.printf("  %.1f RPM  |  %.0f usteps/s  |  ramp %.0f RPM/s  |  %s\n",
                  s_rpm, rpm_to_sps(s_rpm), ACCEL_RPM_S,
                  s_dir > 0 ? "forward" : "reverse");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(PIN_ENABLE, OUTPUT);
    digitalWrite(PIN_ENABLE, LOW);

    // Set a high ceiling — actual speed is controlled by our ramp below.
    stepper.setMaxSpeed(rpm_to_sps(300.0f));

    update_target();

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
    Serial.println("    r   reverse direction");
    Serial.println("    s   stop / start toggle");
    Serial.println("    ?   print current speed");
    Serial.println("────────────────────────────────────────");
    print_status();
    Serial.println();
}

void loop() {
    uint32_t now = millis();

    // ── Ramp s_currentSpeed toward s_targetSpeed each tick ───────────────────
    // Using runSpeed() + manual ramping rather than AccelStepper's run()/moveTo()
    // approach, which decelerates as it approaches the target position and causes
    // audible speed oscillation during continuous rotation.
    if (now - s_lastAccelMs >= ACCEL_INTERVAL_MS) {
        s_lastAccelMs = now;
        float diff  = s_targetSpeed - s_currentSpeed;
        float delta = accel_per_tick();
        if (fabsf(diff) <= delta) {
            s_currentSpeed = s_targetSpeed;
        } else {
            s_currentSpeed += (diff > 0.0f) ? delta : -delta;
        }
        stepper.setSpeed(s_currentSpeed);
    }

    stepper.runSpeed();

    if (!Serial.available()) return;

    char c = Serial.read();
    switch (c) {
        case '+':
            s_rpm += RPM_STEP;
            update_target();
            Serial.print("Speed up → ");
            print_status();
            break;

        case '-':
            s_rpm = max(RPM_MIN, s_rpm - RPM_STEP);
            update_target();
            Serial.print("Speed down → ");
            print_status();
            break;

        case 'r':
        case 'R':
            s_dir = -s_dir;
            update_target();
            Serial.print("Reversing → ");
            print_status();
            break;

        case 's':
        case 'S':
            s_running = !s_running;
            update_target();
            if (!s_running) {
                Serial.println("Stopping...");
            } else {
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

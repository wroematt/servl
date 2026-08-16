#include <Arduino.h>
#include <AccelStepper.h>

// ── Pin assignments ───────────────────────────────────────────────────────────
constexpr uint8_t PIN_STEP   = 25;
constexpr uint8_t PIN_DIR    = 33;
constexpr uint8_t PIN_ENABLE = 32;   // active LOW (A4988, DRV8825)

// ── Motion parameters ─────────────────────────────────────────────────────────
constexpr float   STEPS_PER_REV  = 200.0f;  // 200 = 1.8° stepper
constexpr uint8_t MICROSTEP      = 8;        // match driver MS pin settings

constexpr float USTEPS_PER_REV   = STEPS_PER_REV * MICROSTEP;

// Starting values — both are adjustable at runtime via serial commands.
constexpr float RPM_START         = 60.0f;
constexpr float ACCEL_RPM_S_START = 30.0f;  // RPM/s ramp rate

// Adjustment step per keypress.
constexpr float RPM_STEP          = 10.0f;
constexpr float ACCEL_STEP        = 10.0f;  // RPM/s per [ / ] press
constexpr float RPM_MIN           = 5.0f;
constexpr float ACCEL_MIN         = 5.0f;

// How often the ramp tick runs (ms). Lower = smoother ramp, more CPU.
constexpr uint32_t ACCEL_INTERVAL_MS = 10;

static float    s_rpm          = RPM_START;
static float    s_accel        = ACCEL_RPM_S_START;  // RPM/s, adjustable
static int      s_dir          = 1;      // 1 = forward, -1 = reverse
static bool     s_running      = true;
static float    s_currentSpeed = 0.0f;  // speed currently sent to driver (signed usteps/s)
static float    s_targetSpeed  = 0.0f;  // desired speed (signed usteps/s)
static uint32_t s_lastAccelMs  = 0;

static AccelStepper stepper(AccelStepper::DRIVER, PIN_STEP, PIN_DIR);

static float rpm_to_sps(float rpm) {
    return (rpm / 60.0f) * USTEPS_PER_REV;
}

// usteps/s to add/subtract per ramp tick to achieve s_accel RPM/s.
static float accel_per_tick() {
    return (s_accel / 60.0f) * USTEPS_PER_REV * (ACCEL_INTERVAL_MS / 1000.0f);
}

static void update_target() {
    s_targetSpeed = s_running ? rpm_to_sps(s_rpm) * (float)s_dir : 0.0f;
}

static void print_status() {
    Serial.printf("  speed %.1f RPM  |  accel %.0f RPM/s  |  %s\n",
                  s_rpm, s_accel, s_dir > 0 ? "forward" : "reverse");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    pinMode(PIN_ENABLE, OUTPUT);
    digitalWrite(PIN_ENABLE, LOW);

    // Set a generous ceiling — actual speed is controlled by the ramp.
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
    Serial.println("  Speed:        + / = / -");
    Serial.println("  Acceleration: ] / [");
    Serial.println("  Reverse:      r");
    Serial.println("  Stop/start:   s");
    Serial.println("  Status:       ?");
    Serial.println("────────────────────────────────────────");
    print_status();
    Serial.println();
}

void loop() {
    uint32_t now = millis();

    // ── Ramp s_currentSpeed toward s_targetSpeed ──────────────────────────────
    // runSpeed() + manual ramp is used instead of AccelStepper's run()/moveTo()
    // because the position-based approach decelerates near the target and causes
    // speed oscillation during continuous rotation. The ramp applies equally to
    // start, stop, speed changes, and direction reversals.
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
        // ── Speed up ─────────────────────────────────────────────────────────
        case '+':
        case '=':   // = is + without shift
            s_rpm += RPM_STEP;
            update_target();
            Serial.print("Speed up → ");
            print_status();
            break;

        // ── Speed down ───────────────────────────────────────────────────────
        case '-':
            s_rpm = max(RPM_MIN, s_rpm - RPM_STEP);
            update_target();
            Serial.print("Speed down → ");
            print_status();
            break;

        // ── Accel up ─────────────────────────────────────────────────────────
        case ']':
            s_accel += ACCEL_STEP;
            Serial.print("Accel up → ");
            print_status();
            break;

        // ── Accel down ───────────────────────────────────────────────────────
        case '[':
            s_accel = max(ACCEL_MIN, s_accel - ACCEL_STEP);
            Serial.print("Accel down → ");
            print_status();
            break;

        // ── Reverse ──────────────────────────────────────────────────────────
        case 'r':
        case 'R':
            s_dir = -s_dir;
            update_target();
            Serial.print("Reversing → ");
            print_status();
            break;

        // ── Stop / start ─────────────────────────────────────────────────────
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

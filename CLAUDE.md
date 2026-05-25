# PetFeeder — Claude Code Project Briefing

This file is read automatically by Claude Code at the start of every session.
It contains everything needed to understand the project without prior context.

---

## What this project is

An automated pet feeder system. A Wi-Fi connected hardware device (ESP32) sits on a
home network and dispenses precise weights of dry food from a hopper on command.
The system consists of:

- **Android app** (Kotlin / Jetpack Compose) — primary user interface
- **Website** (React / Next.js) — companion web dashboard
- **Backend** (Node.js / TypeScript) — REST API, MQTT broker, job scheduler
- **Firmware** (ESP32 / C++) — device logic (out of scope for this codebase)

The backend runs entirely in Docker containers on a Raspberry Pi 4 at home,
exposed to the internet via Cloudflare Tunnel (no port forwarding needed).
Everything is designed to be portable — the same Docker Compose file can run
on a VPS or cloud provider without code changes.

The brand name for the system is "servl" which is pronounced like the animal serval
while also including the verb serve as in to serve food.
The brand colours are Olive green #909C75, tan #B7BFA8, and brown #AA835B. As well as black and white.

---

## Repository structure

```
servl/
├── docker-compose.yml              # Full stack — start with: docker compose up
├── .env.example                    # Copy to .env and fill in secrets
├── CLAUDE.md                       # This file
│
├── nginx/
│   └── nginx.conf                  # Reverse proxy, rate limiting, TLS
│
├── mosquitto/
│   ├── config/
│   │   ├── mosquitto.conf          # MQTT broker config
│   │   ├── acl                     # Per-client topic permissions
│   │   └── passwd                  # Internal service credentials (generated)
│   └── certs/                      # CA + server TLS certs (generated at setup)
│
├── postgres/
│   └── migrations/
│       └── 001_initial_schema.sql  # All tables — auto-runs on first Postgres start
│
├── shared/
│   └── types/
│       └── index.ts                # Domain types shared across all services
│
├── services/
│   ├── api-gateway/                # JWT auth, rate limiting, proxies to services
│   ├── user-service/               # Auth, users, households, password reset
│   ├── pet-service/                # Pets, feed history, statistics, schedules
│   ├── device-service/             # Device provisioning, MQTT cert issuance, status
│   ├── feed-service/               # Dispense commands, Google Home webhook
│   └── notification-service/       # FCM push notifications, low-hopper alerts
│
├── worker/                         # BullMQ schedule worker + cron job runner
├── website/                        # Next.js web app
└── android/                        # Kotlin / Jetpack Compose Android app
```

Each service under `services/` is an independent Node.js/TypeScript Express app
with its own `package.json` and `Dockerfile`. They communicate only via HTTP
(proxied by the API gateway) and never call each other directly.

---

## Technology stack

### Backend services (all Node.js 20 / TypeScript)
| Concern | Choice |
|---|---|
| HTTP framework | Express 4 |
| Database client | `pg` (node-postgres) — raw SQL, no ORM |
| Validation | `zod` |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Job queues | BullMQ (backed by Redis) |
| MQTT client | `mqtt` npm package |
| Email | Nodemailer |
| Push notifications | Firebase Admin SDK (FCM) |
| Testing | Vitest + Supertest |

### Infrastructure
| Concern | Choice |
|---|---|
| Container runtime | Docker + Docker Compose |
| Reverse proxy | Nginx |
| Database | PostgreSQL 16 |
| Cache / queues | Redis 7 |
| MQTT broker | Eclipse Mosquitto 2.0 |
| External access | Cloudflare Tunnel (`cloudflared`) |

### Website
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Recharts (statistics charts)
- React Query (server state)

### Android app
- Kotlin
- Jetpack Compose
- Retrofit (API calls)
- Hilt (dependency injection)
- FCM (push notifications)

---

## Database schema

PostgreSQL. All IDs are UUIDs. Raw SQL migrations in `postgres/migrations/`.
Never use an ORM — write SQL directly with parameterised queries.

### Tables and key relationships

```
households          — top-level owner of all data
  └── users         — belong to a household (role: 'owner' | 'member')
  └── devices       — feeders provisioned to a household
  └── pets          — belong to household, optionally assigned to a device

users
  └── refresh_tokens — one per active session (revokeable individually)

pets
  └── schedules     — recurring feed times (stored as cron expressions)
  └── feed_events   — every dispense event (pending → confirmed | failed)

devices
  └── device_events — append-only error/status log
```

### Critical schema rules
- `pets.deleted_at` — soft delete only. Never hard-delete pets; feed history must be preserved.
- `feed_events.weight_dispensed_g` — nullable. Set to null until device confirms. Requested weight is in `weight_requested_g`.
- `feed_events.trigger_type` — enum: `'manual' | 'schedule' | 'voice' | 'api'`
- `feed_events.status` — enum: `'pending' | 'confirmed' | 'failed' | 'timeout'`
- `schedules.cron_expression` — standard 5-field cron (minute hour dom month dow)
- `devices.hopper_pct` — updated live from MQTT status messages (0–100)
- Household always has at least one owner — enforced at API layer, not DB

---

## API design

### Base URL
`https://{DOMAIN}/api/`

### Authentication
- **Access token**: JWT, 15-minute expiry, sent as `Authorization: Bearer <token>`
- **Refresh token**: opaque token, 30-day expiry, stored hashed in `refresh_tokens` table
- **Three tiers**: `public` (no auth), `JWT` (any member), `owner` (household owner only)

The API gateway verifies JWTs and forwards `x-user-id`, `x-household-id`, and
`x-user-role` headers to downstream services. Services trust these headers —
they never re-verify the JWT themselves.

### Endpoint groups
| Prefix | Service | Auth |
|---|---|---|
| `/auth/*` | user-service | public |
| `/users/*` | user-service | JWT / owner |
| `/pets/*` | pet-service | JWT |
| `/feed/*` | feed-service | JWT |
| `/schedules/*` | pet-service | JWT |
| `/devices/*` | device-service | JWT / owner |
| `/webhook/google-home` | feed-service | HMAC |

### Key endpoints
```
POST   /auth/register              Create user + household
POST   /auth/login                 Returns access + refresh tokens
POST   /auth/refresh               Exchange refresh token for new access token
POST   /auth/logout                Revoke refresh token
POST   /auth/forgot-password       Send reset email
POST   /auth/reset-password        Consume reset token, revoke all sessions

GET    /users/me                   Current user profile
PATCH  /users/me                   Update name / photo / FCM token / password
GET    /users/household            List household members
POST   /users/household/invite     Generate invite link (owner only)
POST   /users/household/join       Accept invite, join household
PATCH  /users/:userId/role         Promote/demote member (owner only, last-owner guard)
DELETE /users/:userId              Remove member (owner only)

GET    /pets                       List all pets with today's intake summary
POST   /pets                       Create pet (multipart for photo)
GET    /pets/:petId                Full pet profile
PATCH  /pets/:petId                Update pet
DELETE /pets/:petId                Soft delete
GET    /pets/:petId/feeds          Paginated feed history (filter: date, trigger_type)
GET    /pets/:petId/stats          Aggregated stats (param: from, to)

POST   /feed/meal                  Dispense meal weight for pet (body: petId)
POST   /feed/snack                 Dispense snack weight for pet (body: petId)
POST   /feed/custom                Dispense custom weight (body: petId, weightG)

GET    /schedules                  All household schedules (optional: ?petId)
POST   /schedules                  Create schedule
PATCH  /schedules/:scheduleId      Update or toggle enabled
DELETE /schedules/:scheduleId      Delete + remove pending BullMQ jobs

GET    /devices                    All devices with live status
POST   /devices                    Provision new device (owner only)
GET    /devices/:deviceId          Device detail + recent events
PATCH  /devices/:deviceId          Rename or reassign (owner only)
DELETE /devices/:deviceId          Unlink + revoke MQTT cert (owner only)
GET    /devices/:deviceId/events   Paginated device event log

POST   /webhook/google-home        Google Actions webhook (HMAC auth)
```

### Error response format
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Human readable message",
  "details": {}
}
```

Common error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`,
`RATE_LIMITED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `LAST_OWNER`

---

## MQTT architecture

### Broker
Mosquitto running in Docker. Two listeners:
- **Port 1883** — internal Docker network only (services use this, no TLS needed)
- **Port 8883** — exposed to LAN (devices connect here with TLS + client certificates)

### Topic structure
```
feeder/{deviceId}/cmd       server → device  (dispense commands)
feeder/{deviceId}/status    device → server  (telemetry, confirmations)
```

### Command payload (server → device)
```json
{
  "command_id": "<feed_event.id>",
  "action": "dispense",
  "weight_g": 80
}
```

### Status payload (device → server)
```json
{
  "command_id": "<feed_event.id>",
  "hopper_pct": 72,
  "dispensed_g": 79,
  "status": "ok",
  "firmware_version": "1.2.0"
}
```
The `command_id` links the confirmation back to the `feed_events` row.
When received, update `feed_events.status = 'confirmed'` and
`feed_events.weight_dispensed_g = dispensed_g`.

### Device security
Each ESP32 gets a unique TLS client certificate at provisioning time.
The certificate CN is `device_{uuid}` which Mosquitto uses as the MQTT client ID.
The ACL restricts each device to only its own topics.

---

## Scheduled feeds (job queue)

BullMQ backed by Redis. Two components in the `worker/` container:

1. **Cron runner** — fires every minute, queries enabled schedules, enqueues due jobs
2. **Worker** — processes `feed-jobs` queue, calls `feed-service /internal/dispense`

Deduplication: a Redis key `feed-dedup:{scheduleId}:{minuteBucket}` with 120s TTL
prevents double-enqueueing if the cron fires twice.

Failed jobs retry 3 times with exponential backoff (5s base).
Jobs timeout after 30 seconds — if no MQTT confirmation arrives within 30s,
the `feed_events` row is marked `timeout`.

---

## Security rules — always follow these

1. **Never log secrets** — no JWT secrets, passwords, API keys, or MQTT certs in logs
2. **Parameterised queries only** — never concatenate user input into SQL strings
3. **Validate all input with zod** — at the service boundary, before any DB query
4. **Services trust gateway headers** — `x-household-id` scopes all DB queries.
   Every query MUST filter by `household_id` to prevent cross-household data leaks.
5. **Passwords**: bcrypt with cost factor 12 minimum
6. **Tokens**: store only the hash of refresh tokens and reset tokens, never plaintext
7. **Rate limiting**: auth endpoints get a stricter limit (5 req/15min per IP)
8. **File uploads**: validate MIME type and size (max 5MB) before storing
9. **Owner guard**: before demoting/removing a user, check
   `SELECT COUNT(*) FROM users WHERE household_id = $1 AND role = 'owner'` > 1
10. **MQTT**: device service is the only service that publishes commands.
    Feed service calls device service internally — it never touches MQTT directly.

---

## Code style and conventions

- **TypeScript strict mode** on everywhere
- **No ORM** — raw SQL with `pg`. Use parameterised queries (`$1`, `$2`, etc.)
- **Zod schemas** defined at the top of each route file for request validation
- **Error handling**: use a shared `AppError` class with `code` and `statusCode`
- **Async/await** everywhere — no callbacks or raw Promise chains
- **Named exports** only — no default exports in service files
- **Environment variables**: access only via a validated `config.ts` file per service,
  never `process.env.X` scattered through the code
- **Database connection**: one `pg.Pool` per service, exported from `src/lib/db.ts`
- **HTTP status codes**: 200 GET, 201 POST create, 204 DELETE, 400 validation,
  401 auth, 403 forbidden, 404 not found, 409 conflict, 429 rate limited

### File naming
- Route files: `src/routes/resource.ts` (e.g. `src/routes/pets.ts`)
- Lib/utilities: `src/lib/name.ts`
- Types: import from `shared/types/index.ts`
- Config: `src/config.ts` — validates env vars with zod at startup, crashes fast if missing

### Service template structure
```
services/{name}/
├── src/
│   ├── index.ts          # Express app setup + server start
│   ├── config.ts         # Zod-validated env vars
│   ├── routes/           # One file per resource group
│   └── lib/
│       ├── db.ts         # pg.Pool singleton
│       └── ...           # Other utilities
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## Environment variables

All secrets live in `.env` (gitignored). See `.env.example` for the full list.
Key variables:

```
DATABASE_URL          postgresql://user:pass@postgres:5432/petfeeder
REDIS_URL             redis://:password@redis:6379
JWT_SECRET            64-byte hex string
MQTT_BROKER_URL       mqtt://mosquitto:1883  (internal, no TLS)
MQTT_INTERNAL_USER    internal_service
MQTT_INTERNAL_PASS    ...
FCM_PROJECT_ID        Firebase project ID
FCM_PRIVATE_KEY       Firebase service account private key
GOOGLE_HOME_HMAC_SECRET  32-byte hex string
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
```

---

## Running locally

```bash
# 1. Copy and fill in secrets
cp .env.example .env

# 2. Start the full stack
docker compose up -d

# 3. Check all containers are healthy
docker compose ps

# 4. Tail logs for a specific service
docker compose logs -f user-service

# 5. Run migrations manually if needed
docker compose exec postgres psql -U petfeeder -d petfeeder \
  -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# 6. Connect to Postgres directly
docker compose exec postgres psql -U petfeeder -d petfeeder
```

---

## Current build status

The following files have been scaffolded and are complete:

- `docker-compose.yml` — full stack definition
- `.env.example` — all environment variable keys documented
- `nginx/nginx.conf` — reverse proxy config with rate limiting
- `mosquitto/config/mosquitto.conf` — broker config
- `mosquitto/config/acl` — topic access control
- `postgres/migrations/001_initial_schema.sql` — full schema with indexes and triggers
- `shared/types/index.ts` — all domain types
- `services/api-gateway/src/index.ts` — routing and proxy logic
- `services/api-gateway/src/middleware/auth.ts` — JWT middleware
- `worker/src/index.ts` — BullMQ worker and cron runner

### What needs to be built next (suggested order)

1. `services/user-service` — auth routes first (`/auth/register`, `/auth/login`,
   `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`),
   then user + household routes
2. `services/pet-service` — pets CRUD, feed history, stats, schedules
3. `services/feed-service` — dispense endpoints + Google Home webhook
4. `services/device-service` — provisioning, MQTT subscription, status updates
5. `services/notification-service` — FCM push + low-hopper alerts
6. `website/` — Next.js app (all pages exist in wireframe form)
7. `android/` — Kotlin app (all screens exist in wireframe form)

### Wireframes
Full interactive wireframes for all app screens and website pages were designed
before implementation. They live as standalone HTML files and document the intended
UX and design intent for every screen. Refer to these when building the frontend.

---

## Key design decisions (the "why")

- **No ORM**: the schema is simple and well-defined. Raw SQL gives full control,
  better performance, and no magic. All queries are easy to read and audit.
- **Household scoping**: every table scopes data to a household, not a user.
  This makes multi-user sharing a first-class feature, not an afterthought.
- **Soft delete for pets**: deleting a pet must not destroy feed history.
  `deleted_at` hides pets from queries while preserving all records.
- **Cron in worker, not DB**: scheduled jobs are managed in BullMQ/Redis rather
  than a DB scheduler. This gives retry logic, visibility, and deduplication for free.
- **MQTT confirmation loop**: every dispense creates a `pending` feed_event first.
  The device confirms back via MQTT which updates the row. This gives an accurate
  record of what was actually dispensed vs requested, and surfaces device failures.
- **Per-device MQTT certs**: password-based MQTT auth is weak. X.509 certificates
  mean a compromised device can be revoked by deleting its cert without affecting others.
- **Cloudflare Tunnel**: solves home hosting (no static IP, no port forwarding)
  and provides free TLS termination. Zero config on the router.
- **Services trust gateway headers**: avoids re-validating JWT in every service.
  The gateway is the single auth enforcement point. Services assume the gateway
  has already validated — this keeps service code simple.

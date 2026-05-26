# Servl

An automated pet feeder system. A Wi-Fi connected device (ESP32) sits on a home network and dispenses precise weights of dry food from a hopper on command. The system is controlled through an Android app and a companion web dashboard.

## Stack

| Layer | Technology |
|---|---|
| Backend services | Node.js 20 / TypeScript / Express |
| Database | PostgreSQL 16 |
| Cache & queues | Redis 7 + BullMQ |
| MQTT broker | Eclipse Mosquitto 2.0 |
| Reverse proxy | Nginx |
| Web dashboard | Next.js 14 (App Router) / Tailwind CSS |
| Android app | Kotlin / Jetpack Compose |
| Firmware | ESP32 / C++ (separate repo) |
| External access | Cloudflare Tunnel |

## Repository structure

```
servl/
├── docker-compose.yml              # Full stack — start with: docker compose up
├── .env.example                    # Copy to .env and fill in secrets
├── nginx/                          # Reverse proxy config
├── mosquitto/                      # MQTT broker config and ACL
├── postgres/migrations/            # SQL schema migrations
├── shared/types/                   # Domain types shared across services
├── services/
│   ├── api-gateway/                # JWT auth, rate limiting, proxies to services
│   ├── user-service/               # Auth, users, households, password reset
│   ├── pet-service/                # Pets, feed history, stats, schedules
│   ├── device-service/             # Device provisioning, MQTT cert issuance
│   ├── feed-service/               # Dispense commands, Google Home webhook
│   └── notification-service/       # FCM push notifications, low-hopper alerts
├── worker/                         # BullMQ schedule worker + cron runner
├── website/                        # Next.js web dashboard
└── android/                        # Kotlin Android app
```

## Getting started

### Prerequisites

- Docker and Docker Compose
- Node.js 20 (for local development outside Docker)

### Running the full stack

```bash
# 1. Copy and fill in secrets
cp .env.example .env

# 2. Start all services
docker compose up -d

# 3. Check everything is healthy
docker compose ps

# 4. Open the web dashboard
open http://localhost:3006
```

The API gateway is available at `http://localhost:3000`.

### Rebuilding after code changes

```bash
# Rebuild a single service
docker compose build <service-name>
docker compose up -d <service-name>

# Rebuild the website (version string is baked in at build time)
# Edit website/src/lib/version.ts first, then:
docker compose build website
docker compose up -d website
```

### Useful commands

```bash
# Tail logs for a service
docker compose logs -f user-service

# Connect to Postgres directly
docker compose exec postgres psql -U petfeeder -d petfeeder

# Run migrations manually
docker compose exec postgres psql -U petfeeder -d petfeeder \
  -f /docker-entrypoint-initdb.d/001_initial_schema.sql
```

## Services

| Service | Port | Responsibility |
|---|---|---|
| api-gateway | 3000 | Single entry point — verifies JWTs, rate limits, proxies to services |
| user-service | 3001 | Registration, login, token refresh, households, profile photos |
| pet-service | 3002 | Pet CRUD, feed history, statistics, schedules |
| device-service | 3003 | Device provisioning, MQTT certificate issuance, live status |
| feed-service | 3005 | Dispense commands, Google Home webhook |
| notification-service | 3004 | FCM push notifications, low-hopper alerts |
| worker | — | BullMQ schedule processor and cron runner |
| website | 3006 | Next.js web dashboard |

## Architecture notes

- **Household scoping** — all data belongs to a household, not an individual user. Sharing is a first-class feature.
- **No ORM** — raw SQL with parameterised queries (`pg`). The schema is simple and well-defined; an ORM would add magic without benefit.
- **Soft deletes for pets** — `pets.deleted_at` hides pets from queries while preserving all feed history.
- **MQTT confirmation loop** — every dispense creates a `pending` feed event. The device confirms via MQTT which updates the row to `confirmed` (or `failed`/`timeout`).
- **Per-device TLS certificates** — each ESP32 gets a unique X.509 client cert at provisioning. A compromised device can be revoked without affecting others.
- **Cloudflare Tunnel** — solves home hosting (no static IP, no port forwarding) and provides free TLS termination.
- **Services trust gateway headers** — `x-user-id`, `x-household-id`, `x-user-role` are set by the gateway after JWT verification. Services never re-verify the JWT.

## Environment variables

See `.env.example` for the full list of required variables. Key ones:

```
DATABASE_URL          PostgreSQL connection string
REDIS_URL             Redis connection string
JWT_SECRET            64-byte hex string
MQTT_INTERNAL_USER    Internal MQTT credentials
SMTP_*                Email provider for password reset
FCM_*                 Firebase Cloud Messaging for push notifications
GOOGLE_HOME_HMAC_SECRET  Webhook HMAC secret
```

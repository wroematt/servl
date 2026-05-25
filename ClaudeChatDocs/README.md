# PetFeeder — project structure

```
petfeeder/
│
├── docker-compose.yml          # Full stack — run everything with: docker compose up
├── .env.example                # Copy to .env and fill in secrets
│
├── nginx/
│   ├── nginx.conf              # Reverse proxy + rate limiting config
│   └── certs/                  # TLS certs (managed by Cloudflare Tunnel or certbot)
│
├── mosquitto/
│   ├── config/
│   │   ├── mosquitto.conf      # Broker config — ports, TLS, auth
│   │   ├── acl                 # Topic access control per client
│   │   └── passwd              # Internal service account passwords (generated)
│   └── certs/                  # CA + server cert for TLS (generated at setup)
│
├── postgres/
│   └── migrations/
│       └── 001_initial_schema.sql  # All tables, indexes, triggers — auto-runs on first start
│
├── shared/
│   └── types/
│       └── index.ts            # Domain types shared across all services
│
├── services/
│   ├── api-gateway/            # JWT validation, rate limiting, request routing
│   │   ├── src/
│   │   │   ├── index.ts        # Express app + proxy routes
│   │   │   └── middleware/
│   │   │       ├── auth.ts     # requireAuth + requireOwner middleware
│   │   │       └── error.ts    # Global error handler
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── user-service/           # Auth, users, households, invites
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts     # /auth/* endpoints
│   │   │   │   └── users.ts    # /users/* endpoints
│   │   │   └── lib/
│   │   │       ├── db.ts       # Postgres pool
│   │   │       └── email.ts    # Nodemailer wrapper
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── pet-service/            # Pets, feed history, stats, schedules
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── routes/
│   │   │       ├── pets.ts
│   │   │       └── schedules.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── device-service/         # Device provisioning, status, MQTT cert issuance
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   │   └── devices.ts
│   │   │   └── lib/
│   │   │       ├── mqtt.ts     # MQTT client (subscribes to feeder/+/status)
│   │   │       └── certs.ts    # Generates per-device TLS certs
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── feed-service/           # Dispense commands, Google Home webhook
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── routes/
│   │   │       ├── feed.ts     # /feed/meal, /feed/snack, /feed/custom
│   │   │       ├── internal.ts # /internal/dispense (called by worker)
│   │   │       └── webhook.ts  # /webhook/google-home
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── notification-service/   # FCM push notifications, low-hopper alerts
│       ├── src/
│       │   ├── index.ts
│       │   └── lib/
│       │       └── fcm.ts      # Firebase Admin SDK wrapper
│       ├── Dockerfile
│       └── package.json
│
├── worker/                     # BullMQ schedule worker + cron
│   ├── src/
│   │   └── index.ts            # Cron runner + BullMQ worker
│   ├── Dockerfile
│   └── package.json
│
├── website/                    # Next.js web app
│   ├── src/
│   │   ├── app/                # App router pages
│   │   ├── components/
│   │   └── lib/
│   │       └── api.ts          # Typed API client
│   ├── Dockerfile
│   └── package.json
│
└── android/                    # Kotlin / Jetpack Compose app
    └── app/
        └── src/main/
            ├── java/io/petfeeder/
            │   ├── ui/         # Composable screens
            │   ├── viewmodel/  # ViewModels per screen
            │   ├── data/
            │   │   ├── api/    # Retrofit service interfaces
            │   │   └── repo/   # Repository pattern
            │   └── di/         # Hilt dependency injection
            └── res/
```

## Getting started on a Raspberry Pi

### Prerequisites
- Raspberry Pi 4 (4 GB recommended)
- Raspberry Pi OS 64-bit (Bookworm)
- Docker + Docker Compose installed
- A domain pointing to Cloudflare (for the tunnel)

### 1 — Clone and configure
```bash
git clone https://github.com/your-org/petfeeder.git
cd petfeeder
cp .env.example .env
# Edit .env with your values
```

### 2 — Generate MQTT certificates
```bash
# Run the cert generation script (creates mosquitto/certs/)
./scripts/generate-mqtt-certs.sh
```

### 3 — Start the stack
```bash
docker compose up -d
# Check everything is healthy:
docker compose ps
```

### 4 — Set up Cloudflare Tunnel
```bash
# Install cloudflared on the Pi
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg
# Follow Cloudflare dashboard → Zero Trust → Tunnels → Create tunnel
# Point tunnel to http://localhost:80
```

### 5 — Run database migrations
Migrations run automatically on first Postgres start via `docker-entrypoint-initdb.d`.
For subsequent migrations, use a tool like `node-pg-migrate` or `flyway`.

## Migrating to cloud

Because every service is a Docker container, moving to cloud is:
1. Push images to a container registry (ECR, GCR, or Docker Hub)
2. Replace `docker-compose.yml` with your cloud provider's equivalent
   (AWS ECS task definitions, GCP Cloud Run services, or a VPS with the same compose file)
3. Point your `.env` at managed database and Redis instances
4. No code changes required

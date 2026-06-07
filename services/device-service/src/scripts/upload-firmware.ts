// ── Firmware upload tool ────────────────────────────────────────────────────
//
// Deliberately NOT an HTTP endpoint. Uploading a firmware image is the single
// highest-consequence write this system can perform — the binary it stores is
// later pushed, unmodified, to physical ESP32 devices and flashed onto them
// (see POST /devices/:deviceId/ota in routes/devices.ts). Anyone who could
// reach an upload endpoint over the network could brick or fully take over
// every feeder in the field.
//
// Standard `role === 'owner'` auth (used elsewhere in this service) is scoped
// to *household* ownership — any visitor can self-register via /auth/register
// and become the owner of their own household, so it does not mean "only the
// developer". Layering a bespoke admin-secret check on top of it would still
// leave a brand-new internet-facing binary-upload route as standing attack
// surface for the worst-case operation in the whole stack.
//
// Instead this is a CLI tool that talks to Postgres directly over the
// internal Docker network — the exact same trust boundary that already
// guards `.env` secrets, deploys, and `docker compose exec` access. If you
// can run this script, you already have the keys to the kingdom; if you
// can't, no amount of API-level auth would have stopped you anyway. No new
// route, nothing new to patch, rate-limit or audit.
//
// Usage (run from inside the device-service container so DATABASE_URL
// resolves on the internal network — Postgres has no host port mapping):
//
//   docker compose cp ./firmware.bin pf_device_service:/tmp/firmware.bin
//   docker compose exec device-service \
//     node dist/scripts/upload-firmware.js /tmp/firmware.bin 1.3.6 [uploadedByUserId]
//
// `uploadedByUserId` is optional — pass a users.id UUID to record who
// uploaded it (purely informational; FK is ON DELETE SET NULL).

import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';
import { db } from '../lib/db';

async function main(): Promise<void> {
  const [, , filePath, version, uploadedByUserId] = process.argv;

  if (!filePath || !version) {
    console.error('Usage: upload-firmware.js <path-to-firmware.bin> <version> [uploadedByUserId]');
    process.exitCode = 1;
    return;
  }

  const stats = statSync(filePath);
  const data = readFileSync(filePath);
  const sha256 = createHash('sha256').update(data).digest('hex');
  const filename = basename(filePath);

  console.log(`File:     ${filename}`);
  console.log(`Version:  ${version}`);
  console.log(`Size:     ${stats.size} bytes`);
  console.log(`SHA-256:  ${sha256}`);
  if (uploadedByUserId) console.log(`Uploaded by: ${uploadedByUserId}`);

  const existing = await db.query('SELECT id, uploaded_at FROM firmware_images WHERE version = $1', [version]);
  if (existing.rows[0]) {
    console.error(
      `\nA firmware image with version "${version}" already exists ` +
      `(id=${existing.rows[0].id}, uploaded_at=${existing.rows[0].uploaded_at}). ` +
      `Versions are unique — bump FIRMWARE_VERSION in firmware/src/config.h and rebuild ` +
      `if you need to upload a new image.`,
    );
    process.exitCode = 1;
    return;
  }

  const result = await db.query(
    `INSERT INTO firmware_images (version, filename, size_bytes, sha256, data, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, uploaded_at`,
    [version, filename, stats.size, sha256, data, uploadedByUserId ?? null],
  );

  console.log(`\nUploaded. id=${result.rows[0].id} uploaded_at=${result.rows[0].uploaded_at}`);
  console.log('Devices will receive this version on their next POST /devices/:deviceId/ota.');
}

main()
  .catch((err) => {
    console.error('Upload failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.end();
  });

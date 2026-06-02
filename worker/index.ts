// ─────────────────────────────────────────────
//  Schedule worker
//  Runs every minute, enqueues due feed jobs.
//  BullMQ workers process jobs and call feed-service.
// ─────────────────────────────────────────────

import { Queue, Worker, Job } from 'bullmq';
import { CronJob } from 'cron';
import pg from 'pg';
import IORedis from 'ioredis';

// External ioredis instance — used only for dedup key management (redis.set).
// NOT passed to BullMQ to avoid the ioredis version type conflict: BullMQ 5.x
// bundles its own ioredis internally and their types are incompatible at compile
// time even though they are functionally identical at runtime.
const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// BullMQ connection — pass a URL object so BullMQ uses its own bundled ioredis.
const bullConnection = { url: process.env.REDIS_URL! };

// ── Queue definitions ─────────────────────────

const feedQueue = new Queue('feed-jobs', { connection: bullConnection });

// ── Cron: every minute, find due schedules ────

new CronJob('* * * * *', async () => {
  const utcNow = new Date();
  console.log(`[cron] tick at ${utcNow.toISOString()}`);
  try {
    // Find all enabled schedules whose pets have an assigned device.
    // Join households to get the timezone so we can fire at the correct local time.
    const { rows: schedules } = await db.query(`
      SELECT s.id, s.pet_id, s.feed_type, s.weight_g, s.cron_expression,
             p.device_id, p.household_id, h.timezone
      FROM schedules s
      JOIN pets p ON p.id = s.pet_id AND p.deleted_at IS NULL
      JOIN households h ON h.id = p.household_id
      WHERE s.enabled = TRUE AND p.device_id IS NOT NULL
    `);

    console.log(`[cron] ${schedules.length} enabled schedule(s) with assigned device`);

    for (const schedule of schedules) {
      // Evaluate the cron expression against the current time in the household's
      // timezone, not UTC.  This means "0 8 * * *" always fires at 08:00 local
      // time regardless of DST transitions.
      const tz = schedule.timezone || 'UTC';
      const localNow = toLocalDate(utcNow, tz);
      const due = isDue(schedule.cron_expression, localNow);
      console.log(`[cron] schedule ${schedule.id} expr="${schedule.cron_expression}" tz=${tz} localNow=${localNow.toISOString()} due=${due}`);

      if (due) {
        // Deduplicate — don't enqueue if already pending in the last 2 minutes
        const dedupKey = `feed-dedup:${schedule.id}:${getMinuteBucket(localNow)}`;
        const already = await redis.set(dedupKey, '1', 'EX', 120, 'NX');
        if (!already) {
          console.log(`[cron] schedule ${schedule.id} already enqueued this minute — skipping`);
          continue;
        }

        const job = await feedQueue.add('dispense', {
          schedule_id: schedule.id,
          pet_id: schedule.pet_id,
          device_id: schedule.device_id,
          weight_g: schedule.weight_g,
          trigger_type: 'schedule',
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        });
        console.log(`[cron] enqueued job ${job.id} for schedule ${schedule.id} device=${schedule.device_id} weight=${schedule.weight_g}g`);
      }
    }
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}, null, true);

// ── Worker: process feed jobs ─────────────────

const feedWorker = new Worker('feed-jobs', async (job: Job) => {
  const { pet_id, device_id, weight_g, trigger_type, schedule_id } = job.data;
  console.log(`[worker] processing job ${job.id} pet=${pet_id} device=${device_id} weight=${weight_g}g trigger=${trigger_type}`);

  const url = `${process.env.FEED_SERVICE_URL}/internal/dispense`;
  console.log(`[worker] POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pet_id, device_id, weight_g, trigger_type, schedule_id }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[worker] job ${job.id} FAILED — feed service ${res.status}: ${body}`);
    throw new Error(`Feed service returned ${res.status}: ${body}`);
  }

  const result = await res.json() as Record<string, unknown>;
  console.log(`[worker] job ${job.id} OK — feed_event=${result['id'] ?? JSON.stringify(result)}`);
  return result;
}, {
  connection: bullConnection,
  concurrency: 5,
});

feedWorker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} permanently failed after all retries: ${err.message}`);
});

// ── Helpers ───────────────────────────────────

function getMinuteBucket(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

/**
 * Returns a Date whose getHours() / getMinutes() / getDay() etc. reflect the
 * wall-clock time in `tz` rather than the server's local timezone (UTC in Docker).
 *
 * Uses Intl.DateTimeFormat.formatToParts() to reliably extract individual
 * date/time components and reassemble them as a local-time Date.
 */
function toLocalDate(utc: Date, tz: string): Date {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year:   'numeric',
        month:  '2-digit',
        day:    '2-digit',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(utc).map(p => [p.type, p.value])
    );
    // hour12:false can return "24" at midnight on some ICU builds — normalise it
    const hour = parts['hour'] === '24' ? '00' : parts['hour'];
    return new Date(`${parts['year']}-${parts['month']}-${parts['day']}T${hour}:${parts['minute']}:${parts['second']}`);
  } catch {
    // Fall back to UTC if the timezone string is invalid.
    return utc;
  }
}

function isDue(cronExpr: string, now: Date): boolean {
  const [minute, hour, dom, month, dow] = cronExpr.split(' ');

  // Supports: * (wildcard), N (exact), N,M (list), N-M (range), */N (step)
  const matches = (field: string, value: number): boolean => {
    if (field === '*') return true;
    // Step: */N  — matches every Nth value (e.g. */15 matches 0,15,30,45)
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return step > 0 && value % step === 0;
    }
    // Comma-separated list — each element may itself be a range or exact value
    return field.split(',').some((part) => {
      if (part.includes('-')) {
        const [lo, hi] = part.split('-').map(Number);
        return value >= lo && value <= hi;
      }
      return parseInt(part, 10) === value;
    });
  };

  return (
    matches(minute, now.getMinutes())    &&
    matches(hour,   now.getHours())      &&
    matches(dom,    now.getDate())        &&
    matches(month,  now.getMonth() + 1)  &&
    matches(dow,    now.getDay())
  );
}

console.log('Schedule worker started');

// ─────────────────────────────────────────────
//  Schedule worker
//  Runs every minute, enqueues due feed jobs.
//  BullMQ workers process jobs and call feed-service.
// ─────────────────────────────────────────────

import { Queue, Worker, Job } from 'bullmq';
import { CronJob } from 'cron';
import pg from 'pg';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ── Queue definitions ─────────────────────────

const feedQueue = new Queue('feed-jobs', { connection: redis });

// ── Cron: every minute, find due schedules ────

new CronJob('* * * * *', async () => {
  try {
    // Find all enabled schedules whose pets have an assigned device
    const { rows: schedules } = await db.query(`
      SELECT s.id, s.pet_id, s.feed_type, s.weight_g, s.cron_expression,
             p.device_id, p.household_id
      FROM schedules s
      JOIN pets p ON p.id = s.pet_id AND p.deleted_at IS NULL
      WHERE s.enabled = TRUE AND p.device_id IS NOT NULL
    `);

    const now = new Date();

    for (const schedule of schedules) {
      if (isDue(schedule.cron_expression, now)) {
        // Deduplicate — don't enqueue if already pending in the last 2 minutes
        const dedupKey = `feed-dedup:${schedule.id}:${getMinuteBucket(now)}`;
        const already = await redis.set(dedupKey, '1', 'EX', 120, 'NX');
        if (!already) continue;

        await feedQueue.add('dispense', {
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
      }
    }
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}, null, true);

// ── Worker: process feed jobs ─────────────────

new Worker('feed-jobs', async (job: Job) => {
  const { pet_id, device_id, weight_g, trigger_type, schedule_id } = job.data;

  const res = await fetch(`${process.env.FEED_SERVICE_URL}/internal/dispense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pet_id, device_id, weight_g, trigger_type, schedule_id }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feed service returned ${res.status}: ${body}`);
  }

  return res.json();
}, {
  connection: redis,
  concurrency: 5,
});

// ── Helpers ───────────────────────────────────

function getMinuteBucket(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
}

function isDue(cronExpr: string, now: Date): boolean {
  // Simple cron match — checks current minute/hour/day against expression.
  // For production, replace with a proper cron parser like 'cron-parser'.
  const [minute, hour, dom, month, dow] = cronExpr.split(' ');
  const matches = (field: string, value: number) =>
    field === '*' || field.split(',').map(Number).includes(value);

  return (
    matches(minute, now.getMinutes()) &&
    matches(hour,   now.getHours())   &&
    matches(dom,    now.getDate())     &&
    matches(month,  now.getMonth() + 1) &&
    matches(dow,    now.getDay())
  );
}

console.log('Schedule worker started');

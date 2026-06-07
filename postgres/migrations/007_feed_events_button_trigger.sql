-- Allow 'button' as a valid feed_events.trigger_type — physical Meal/Snack
-- buttons on the device itself (see TaskList #10 / CLAUDE.md MQTT section).
-- Previously only app/schedule/voice/API-originated feeds were representable,
-- so a device-initiated feed had nowhere accurate to record itself.
ALTER TABLE feed_events DROP CONSTRAINT IF EXISTS feed_events_trigger_type_check;
ALTER TABLE feed_events ADD CONSTRAINT feed_events_trigger_type_check
  CHECK (trigger_type IN ('manual', 'schedule', 'voice', 'api', 'button'));

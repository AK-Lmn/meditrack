-- Migration: 0002_medication_reminders
-- Additive only — does NOT modify or drop any existing tables.
-- Safe to run on the production Neon database.

CREATE TABLE IF NOT EXISTS medication_reminders (
  id          serial PRIMARY KEY,
  user_id     text    NOT NULL,
  medication_id integer NOT NULL,
  schedule_id integer NOT NULL,
  -- Stable idempotency key: "<medicationId>:<ISO8601-date>T<HH:MM>"
  -- e.g. "7:2026-08-20T08:00"
  occurrence_key text NOT NULL,
  -- UTC time the dose is scheduled
  scheduled_for  timestamp NOT NULL,
  -- QStash message ID stored for potential cancellation
  qstash_message_id text,
  -- Delivery status state machine: 'pending' | 'processing' | 'delivered' | 'failed' | 'cancelled'
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now()
);

-- Idempotency guarantee: only one row per (user, occurrence) can exist.
-- Concurrent QStash retries that both try INSERT will get a unique violation
-- on the second attempt, preventing duplicate notifications.
CREATE UNIQUE INDEX IF NOT EXISTS medication_reminders_occurrence_unique
  ON medication_reminders (user_id, occurrence_key);

CREATE INDEX IF NOT EXISTS medication_reminders_schedule_idx
  ON medication_reminders (schedule_id);

CREATE INDEX IF NOT EXISTS medication_reminders_user_idx
  ON medication_reminders (user_id);

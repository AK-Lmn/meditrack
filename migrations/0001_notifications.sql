CREATE TABLE IF NOT EXISTS notification_settings (
  user_id text PRIMARY KEY,
  medication_reminders boolean NOT NULL DEFAULT true,
  browser_notifications boolean NOT NULL DEFAULT false,
  reminder_minutes_before integer NOT NULL DEFAULT 0,
  timezone text NOT NULL DEFAULT 'UTC',
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  medication_id integer,
  dose_occurrence_id integer,
  occurrence_key text NOT NULL,
  type text NOT NULL DEFAULT 'medication_due',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, read);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_occurrence_unique ON notifications (user_id, occurrence_key, type);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

import { pgTable, text, timestamp, boolean, serial, integer, date, index, unique } from 'drizzle-orm/pg-core'

export const user = pgTable('user', { id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(), emailVerified: boolean('emailVerified').notNull().default(false), image: text('image'), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow() })
export const session = pgTable('session', { id: text('id').primaryKey(), expiresAt: timestamp('expiresAt').notNull(), token: text('token').notNull().unique(), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow(), ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull() })
export const account = pgTable('account', { id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(), userId: text('userId').notNull(), accessToken: text('accessToken'), refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: timestamp('accessTokenExpiresAt'), refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'), scope: text('scope'), password: text('password'), createdAt: timestamp('createdAt').notNull().defaultNow(), updatedAt: timestamp('updatedAt').notNull().defaultNow() })
export const verification = pgTable('verification', { id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(), expiresAt: timestamp('expiresAt').notNull(), createdAt: timestamp('createdAt').defaultNow(), updatedAt: timestamp('updatedAt').defaultNow() })

export const medications = pgTable('medications', { id: serial('id').primaryKey(), userId: text('user_id').notNull(), name: text('name').notNull(), dosage: text('dosage').notNull(), dosageUnit: text('dosage_unit').notNull().default('mg'), form: text('form').notNull().default('tablet'), frequency: text('frequency').notNull(), instructions: text('instructions'), color: text('color').notNull().default('blue'), active: boolean('active').notNull().default(true), startDate: date('start_date').notNull().defaultNow(), createdAt: timestamp('created_at').notNull().defaultNow(), updatedAt: timestamp('updated_at').notNull().defaultNow() }, (table) => ({ userActiveIdx: index('medications_user_active_idx').on(table.userId, table.active) }))
export const medicationLogs = pgTable('medication_logs', { id: serial('id').primaryKey(), userId: text('user_id').notNull(), medicationId: integer('medication_id').notNull(), scheduledAt: timestamp('scheduled_at').notNull(), takenAt: timestamp('taken_at'), status: text('status').notNull().default('scheduled'), notes: text('notes'), occurrenceKey: text('occurrence_key') }, (table) => ({ userOccurrenceUnique: unique('medication_logs_user_occurrence_unique').on(table.userId, table.occurrenceKey), userScheduleIdx: index('medication_logs_user_schedule_idx').on(table.userId, table.scheduledAt) }))
export const medicationSchedules = pgTable('medication_schedules', { id: serial('id').primaryKey(), userId: text('user_id').notNull(), medicationId: integer('medication_id').notNull(), timeOfDay: text('time_of_day').notNull(), days: text('days').notNull().default('daily'), frequency: text('frequency').notNull().default('daily'), enabled: boolean('enabled').notNull().default(true) })
export const notifications = pgTable('notifications', { id: serial('id').primaryKey(), userId: text('user_id').notNull(), medicationId: integer('medication_id'), doseOccurrenceId: integer('dose_occurrence_id'), occurrenceKey: text('occurrence_key').notNull(), type: text('type').notNull().default('medication_due'), title: text('title').notNull(), message: text('message').notNull(), read: boolean('read').notNull().default(false), dismissed: boolean('dismissed').notNull().default(false), createdAt: timestamp('created_at').notNull().defaultNow() }, (table) => ({ userReadIdx: index('notifications_user_read_idx').on(table.userId, table.read), userOccurrenceUnique: unique('notifications_user_occurrence_unique').on(table.userId, table.occurrenceKey, table.type) }))
export const pushSubscriptions = pgTable('push_subscriptions', { id: serial('id').primaryKey(), userId: text('user_id').notNull(), endpoint: text('endpoint').notNull(), p256dh: text('p256dh').notNull(), auth: text('auth').notNull(), createdAt: timestamp('created_at').notNull().defaultNow(), updatedAt: timestamp('updated_at').notNull().defaultNow() }, (table) => ({ endpointUnique: unique('push_subscriptions_endpoint_unique').on(table.endpoint), userIdx: index('push_subscriptions_user_idx').on(table.userId) }))
export const notificationSettings = pgTable('notification_settings', { userId: text('user_id').primaryKey(), medicationReminders: boolean('medication_reminders').notNull().default(true), browserNotifications: boolean('browser_notifications').notNull().default(false), reminderMinutesBefore: integer('reminder_minutes_before').notNull().default(0), timezone: text('timezone').notNull().default('UTC'), updatedAt: timestamp('updated_at').notNull().defaultNow() })

/**
 * Tracks scheduled QStash messages for each medication occurrence with state safety.
 * The unique index on (userId, occurrenceKey) is the DB-level idempotency guarantee.
 */
export const medicationReminders = pgTable('medication_reminders', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  medicationId: integer('medication_id').notNull(),
  scheduleId: integer('schedule_id').notNull(),
  /** Stable key: "<medicationId>:<ISO8601-date>T<HH:MM>" e.g. "7:2026-08-20T08:00" */
  occurrenceKey: text('occurrence_key').notNull(),
  /** UTC timestamp of when the dose is scheduled */
  scheduledFor: timestamp('scheduled_for').notNull(),
  /** QStash message ID stored for potential cancellation */
  qstashMessageId: text('qstash_message_id'),
  /** State machine status: 'pending' | 'processing' | 'delivered' | 'failed' | 'cancelled' */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  occurrenceUnique: unique('medication_reminders_occurrence_unique').on(table.userId, table.occurrenceKey),
  scheduleIdx: index('medication_reminders_schedule_idx').on(table.scheduleId),
  userIdx: index('medication_reminders_user_idx').on(table.userId),
}))

export const schema = { user, session, account, verification, medications, medicationLogs, medicationSchedules, notifications, pushSubscriptions, notificationSettings, medicationReminders }
export type Medication = typeof medications.$inferSelect
export type NewMedication = typeof medications.$inferInsert
export type MedicationReminder = typeof medicationReminders.$inferSelect

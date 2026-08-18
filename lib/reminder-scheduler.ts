/**
 * Server-only utility for computing medication reminder occurrence times
 * and scheduling them via QStash.
 *
 * NEVER import from client components.
 */

import { getAppUrl, getQStashClient } from '@/lib/qstash'
import { db } from '@/lib/db'
import { medicationReminders, medicationSchedules } from '@/lib/db/schema'
import { and, eq, or } from 'drizzle-orm'

export type ReminderPayload = {
  reminderId: number
  medicationId: number
  scheduleId: number
  userId: string
  occurrenceKey: string
}

/**
 * Build a stable, unique occurrence key for a reminder.
 * Format: "<medicationId>:<ISO8601-date>T<HH:MM>"
 * Example: "7:2026-08-20T08:00"
 */
export function buildOccurrenceKey(medicationId: number, localDate: string, timeOfDay: string): string {
  return `${medicationId}:${localDate}T${timeOfDay}`
}

/**
 * Compute the next UTC Date for a medication that fires at `timeOfDay` in `timezone`,
 * starting from the day after `afterDate` (or today if afterDate is null).
 *
 * Returns null if the target time is already in the past by more than a few seconds.
 */
export function computeNextOccurrenceUtc(
  timeOfDay: string,
  timezone: string,
  afterDate?: Date,
): { scheduledUtc: Date; localDate: string } | null {
  const baseDate = afterDate ? new Date(afterDate.getTime() + 86_400_000) : new Date()

  // Format the candidate date in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const localDate = formatter.format(baseDate) // "YYYY-MM-DD"

  // Build the local datetime string and parse to UTC
  const [hour, minute] = (timeOfDay || '08:00').split(':').map(Number)

  // Create a Date representing `localDate` at `timeOfDay` in the user's timezone.
  // We do this by creating a UTC date at midnight then offsetting via the timezone offset.
  const candidate = localDatetimeToUtc(localDate, hour, minute, timezone)

  // If the computed time is in the past (more than 30s ago), skip to tomorrow.
  if (candidate.getTime() < Date.now() - 30_000) {
    const tomorrow = new Date(baseDate.getTime() + 86_400_000)
    const tomorrowLocalDate = formatter.format(tomorrow)
    const tomorrowUtc = localDatetimeToUtc(tomorrowLocalDate, hour, minute, timezone)
    return { scheduledUtc: tomorrowUtc, localDate: tomorrowLocalDate }
  }

  return { scheduledUtc: candidate, localDate }
}

/**
 * Convert a local calendar date + time (in a given IANA timezone) to a UTC Date.
 * Uses the Temporal-like trick of parsing an ISO string with a placeholder UTC offset
 * then applying the actual offset.
 */
function localDatetimeToUtc(localDate: string, hour: number, minute: number, timezone: string): Date {
  // Build a reference Date in the middle of the day to find the timezone offset.
  const refDate = new Date(`${localDate}T12:00:00Z`)

  // Format the reference in the target timezone to find the offset.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  }).formatToParts(refDate)

  // Extract offset from timezone name (e.g. "GMT+8" → +480 minutes)
  const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const offsetMatch = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/)
  let offsetMinutes = 0
  if (offsetMatch) {
    const sign = offsetMatch[1] === '+' ? 1 : -1
    offsetMinutes = sign * (parseInt(offsetMatch[2], 10) * 60 + parseInt(offsetMatch[3] ?? '0', 10))
  }

  // local time as UTC = (local datetime) - offset
  const localMs =
    new Date(`${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`).getTime()
  return new Date(localMs - offsetMinutes * 60_000)
}

/**
 * Schedule a QStash message and insert a medication_reminders row.
 * Uses `notBefore` so QStash fires at the exact scheduled UTC time.
 */
export async function scheduleReminder({
  userId,
  medicationId,
  scheduleId,
  timeOfDay,
  timezone,
  afterDate,
}: {
  userId: string
  medicationId: number
  scheduleId: number
  timeOfDay: string
  timezone: string
  afterDate?: Date
}): Promise<{ reminderId: number | null; skipped: boolean }> {
  const occurrence = computeNextOccurrenceUtc(timeOfDay, timezone, afterDate)
  if (!occurrence) return { reminderId: null, skipped: true }

  const { scheduledUtc, localDate } = occurrence
  const occurrenceKey = buildOccurrenceKey(medicationId, localDate, timeOfDay)

  // Insert reminder row (do nothing on conflict — idempotent)
  const [existing] = await db
    .select({ id: medicationReminders.id, status: medicationReminders.status })
    .from(medicationReminders)
    .where(and(eq(medicationReminders.userId, userId), eq(medicationReminders.occurrenceKey, occurrenceKey)))
    .limit(1)

  if (existing) {
    // Already exists — skip
    return { reminderId: existing.id, skipped: true }
  }

  // Try to publish to QStash
  let qstashMessageId: string | null = null
  try {
    const qstash = getQStashClient()
    const appUrl = getAppUrl()
    const notBefore = Math.floor(scheduledUtc.getTime() / 1000)

    // We insert the reminder row first (to get an ID), then update with the QStash message ID.
    const [inserted] = await db.insert(medicationReminders).values({
      userId,
      medicationId,
      scheduleId,
      occurrenceKey,
      scheduledFor: scheduledUtc,
      qstashMessageId: null,
      status: 'pending',
      updatedAt: new Date(),
    }).returning()

    const payload: ReminderPayload = {
      reminderId: inserted.id,
      medicationId,
      scheduleId,
      userId,
      occurrenceKey,
    }

    const result = await qstash.publishJSON({
      url: `${appUrl}/api/reminders/send`,
      body: payload,
      notBefore,
    })

    qstashMessageId = result.messageId ?? null

    // Update the row with the QStash message ID
    await db.update(medicationReminders)
      .set({ qstashMessageId, updatedAt: new Date() })
      .where(eq(medicationReminders.id, inserted.id))

    return { reminderId: inserted.id, skipped: false }
  } catch (err) {
    console.error('[scheduleReminder] Failed to schedule QStash message:', err instanceof Error ? err.message : err)
    return { reminderId: null, skipped: false }
  }
}

/**
 * Cancel all pending (pending or failed) reminders for a medication.
 * Attempts to delete QStash messages where we have IDs.
 * Even if QStash cancel fails, the DB marks them cancelled so the endpoint refuses delivery.
 */
export async function cancelRemindersForMedication(medicationId: number, userId: string): Promise<void> {
  // Get all cancellable reminders
  const pending = await db
    .select({ id: medicationReminders.id, qstashMessageId: medicationReminders.qstashMessageId })
    .from(medicationReminders)
    .where(
      and(
        eq(medicationReminders.medicationId, medicationId),
        eq(medicationReminders.userId, userId),
        or(
          eq(medicationReminders.status, 'pending'),
          eq(medicationReminders.status, 'failed'),
        ),
      ),
    )

  if (pending.length === 0) return

  // Mark all as cancelled in DB first — this is the safety net
  await db.update(medicationReminders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(medicationReminders.medicationId, medicationId),
        eq(medicationReminders.userId, userId),
        or(
          eq(medicationReminders.status, 'pending'),
          eq(medicationReminders.status, 'failed'),
        ),
      ),
    )

  // Best-effort: try to cancel QStash messages
  try {
    const qstash = getQStashClient()
    for (const reminder of pending) {
      if (reminder.qstashMessageId) {
        try {
          await qstash.messages.delete(reminder.qstashMessageId)
        } catch {
          // QStash cancel failure is non-fatal; DB status='cancelled' is the real guard
        }
      }
    }
  } catch {
    // QStash client instantiation failure (e.g. QSTASH_TOKEN not set) — non-fatal
  }
}

/**
 * Cancel all pending reminders for a schedule (used when a schedule is disabled/changed).
 */
export async function cancelRemindersForSchedule(scheduleId: number, userId: string): Promise<void> {
  const pending = await db
    .select({ id: medicationReminders.id, qstashMessageId: medicationReminders.qstashMessageId })
    .from(medicationReminders)
    .where(
      and(
        eq(medicationReminders.scheduleId, scheduleId),
        eq(medicationReminders.userId, userId),
        or(
          eq(medicationReminders.status, 'pending'),
          eq(medicationReminders.status, 'failed'),
        ),
      ),
    )

  if (pending.length === 0) return

  await db.update(medicationReminders)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(medicationReminders.scheduleId, scheduleId),
        eq(medicationReminders.userId, userId),
        or(
          eq(medicationReminders.status, 'pending'),
          eq(medicationReminders.status, 'failed'),
        ),
      ),
    )

  try {
    const qstash = getQStashClient()
    for (const reminder of pending) {
      if (reminder.qstashMessageId) {
        try {
          await qstash.messages.delete(reminder.qstashMessageId)
        } catch { /* non-fatal */ }
      }
    }
  } catch { /* non-fatal */ }
}

/**
 * Server-only utility for computing medication reminder occurrence times
 * and scheduling them via QStash.
 *
 * NEVER import from client components.
 */

import { getAppUrl, getQStashClient } from '@/lib/qstash'
import { db } from '@/lib/db'
import { medicationReminders, medicationSchedules } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

import { buildOccurrenceKey, localDatetimeToUtc } from '@/lib/scheduler'

export type ReminderPayload = {
  reminderId: number
  medicationId: number
  scheduleId: number
  userId: string
  occurrenceKey: string
}

export { buildOccurrenceKey }

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
  const cleanTime = timeOfDay || '08:00'

  // Create a Date representing `localDate` at `timeOfDay` in the user's timezone.
  const candidate = localDatetimeToUtc(localDate, cleanTime, timezone)

  // If the computed time is in the past (more than 30s ago), skip to tomorrow.
  if (candidate.getTime() < Date.now() - 30_000) {
    const tomorrow = new Date(baseDate.getTime() + 86_400_000)
    const tomorrowLocalDate = formatter.format(tomorrow)
    const tomorrowUtc = localDatetimeToUtc(tomorrowLocalDate, cleanTime, timezone)
    return { scheduledUtc: tomorrowUtc, localDate: tomorrowLocalDate }
  }

  return { scheduledUtc: candidate, localDate }
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
  const [schedule] = await db.select({ id: medicationSchedules.id }).from(medicationSchedules)
    .where(and(eq(medicationSchedules.id, scheduleId), eq(medicationSchedules.userId, userId), eq(medicationSchedules.medicationId, medicationId), eq(medicationSchedules.enabled, true))).limit(1)
  if (!schedule) return { reminderId: null, skipped: true }
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

  if (existing?.status === 'delivered' && !afterDate) {
    return scheduleReminder({ userId, medicationId, scheduleId, timeOfDay, timezone, afterDate: scheduledUtc })
  }
  if (existing?.status === 'cancelled') {
    // A replacement gets a new ID so old queued deliveries cannot claim it.
    await db.delete(medicationReminders).where(and(eq(medicationReminders.id, existing.id), eq(medicationReminders.status, 'cancelled')))
  } else if (existing) {
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
    }).onConflictDoNothing({ target: [medicationReminders.userId, medicationReminders.occurrenceKey] }).returning()
    if (!inserted) return { reminderId: null, skipped: true }

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

export async function cancelQueuedMessages(reminders: { qstashMessageId: string | null }[]) {
  const ids = reminders.flatMap(({ qstashMessageId }) => qstashMessageId ? [qstashMessageId] : [])
  if (!ids.length) return
  try {
    const qstash = getQStashClient()
    await Promise.allSettled(ids.map((id) => qstash.messages.delete(id)))
  } catch {
    // The reminder row has already been cancelled or deleted.
  }
}

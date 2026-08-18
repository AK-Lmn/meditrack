/**
 * POST /api/reminders/send
 *
 * Called by QStash at the scheduled medication reminder time.
 *
 * Security:
 * - `verifySignatureAppRouter` validates the QStash HMAC signature using
 *   QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.
 * - Database ownership + activity checks prevent delivering for archived
 *   medications, wrong users, or already-delivered/cancelled reminders.
 *
 * Idempotency & State Machine:
 * - States: 'pending' | 'processing' | 'delivered' | 'failed' | 'cancelled'
 * - Atomic Transition to 'processing':
 *   Claim process: only allow transitioning if status is 'pending', 'failed', or
 *   if it is stuck in 'processing' (updatedAt older than 120 seconds).
 * - Web Push triggers AFTER transition to 'processing'.
 * - If Web Push succeeds (at least one device or no subscriptions configured),
 *   status transitions to 'delivered'.
 * - If Web Push fails with a retryable error, status transitions to 'failed',
 *   and we return a 500 status code to trigger QStash retry.
 */
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  medications,
  medicationReminders,
  medicationSchedules,
  notifications,
  notificationSettings,
  pushSubscriptions,
} from '@/lib/db/schema'
import { and, eq, lte, or } from 'drizzle-orm'
import { sendPushNotification, isVapidConfigured } from '@/lib/web-push'
import { scheduleReminder, type ReminderPayload } from '@/lib/reminder-scheduler'

async function handler(request: Request): Promise<Response> {
  let payload: ReminderPayload
  try {
    payload = (await request.json()) as ReminderPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { reminderId, medicationId, scheduleId, userId, occurrenceKey } = payload

  if (!reminderId || !medicationId || !scheduleId || !userId || !occurrenceKey) {
    return NextResponse.json({ error: 'Missing required payload fields' }, { status: 400 })
  }

  // 1. Fetch the reminder row
  const [reminder] = await db
    .select()
    .from(medicationReminders)
    .where(
      and(
        eq(medicationReminders.id, reminderId),
        eq(medicationReminders.userId, userId),
        eq(medicationReminders.occurrenceKey, occurrenceKey),
      ),
    )
    .limit(1)

  if (!reminder) {
    console.log(`[reminders/send] Reminder ${reminderId} not found — skipping.`)
    return NextResponse.json({ ok: true, skipped: 'not_found' })
  }

  if (reminder.status === 'cancelled') {
    console.log(`[reminders/send] Reminder ${reminderId} is cancelled — skipping.`)
    return NextResponse.json({ ok: true, skipped: 'cancelled' })
  }

  if (reminder.status === 'delivered') {
    console.log(`[reminders/send] Reminder ${reminderId} already delivered — skipping (idempotent).`)
    return NextResponse.json({ ok: true, skipped: 'already_delivered' })
  }

  // If another process is actively deliverying it (updated less than 2 mins ago)
  if (reminder.status === 'processing' && Date.now() - reminder.updatedAt.getTime() < 120_000) {
    console.log(`[reminders/send] Reminder ${reminderId} is currently being processed by another task.`)
    return new Response('Too Many Requests / Concurrent processing', { status: 429 })
  }

  // 2. Verify medication ownership and activity
  const [medication] = await db
    .select()
    .from(medications)
    .where(and(eq(medications.id, medicationId), eq(medications.userId, userId)))
    .limit(1)

  if (!medication) {
    await db.update(medicationReminders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(medicationReminders.id, reminderId))
    console.log(`[reminders/send] Medication ${medicationId} not found for user — cancelled.`)
    return NextResponse.json({ ok: true, skipped: 'medication_not_found' })
  }

  if (!medication.active) {
    await db.update(medicationReminders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(medicationReminders.id, reminderId))
    console.log(`[reminders/send] Medication ${medicationId} is archived — cancelled.`)
    return NextResponse.json({ ok: true, skipped: 'medication_archived' })
  }

  // 3. Verify schedule still exists and is enabled
  const [schedule] = await db
    .select()
    .from(medicationSchedules)
    .where(and(eq(medicationSchedules.id, scheduleId), eq(medicationSchedules.userId, userId)))
    .limit(1)

  if (!schedule || !schedule.enabled) {
    await db.update(medicationReminders)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(medicationReminders.id, reminderId))
    console.log(`[reminders/send] Schedule ${scheduleId} is disabled or missing — cancelled.`)
    return NextResponse.json({ ok: true, skipped: 'schedule_disabled' })
  }

  // 4. Atomically transition to 'processing'.
  // This statement claims the reminder if it is 'pending', 'failed', or stuck in 'processing' (last updated > 120s ago).
  const updateResult = await db.update(medicationReminders)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(
      and(
        eq(medicationReminders.id, reminderId),
        or(
          eq(medicationReminders.status, 'pending'),
          eq(medicationReminders.status, 'failed'),
          and(
            eq(medicationReminders.status, 'processing'),
            lte(medicationReminders.updatedAt, new Date(Date.now() - 120_000))
          )
        )
      )
    )
    .returning({ id: medicationReminders.id })

  if (updateResult.length === 0) {
    // Another concurrent task claimed it first or it was finished/cancelled since we read it
    const [recheck] = await db
      .select({ status: medicationReminders.status })
      .from(medicationReminders)
      .where(eq(medicationReminders.id, reminderId))
      .limit(1)

    if (recheck?.status === 'delivered' || recheck?.status === 'cancelled') {
      return NextResponse.json({ ok: true, skipped: 'completed_or_cancelled_by_concurrent' })
    }
    return new Response('Concurrent attempt in progress', { status: 429 })
  }

  // 5. Fetch user notification settings and push subscriptions
  const [settings] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1)

  const notifTitle = 'MediTrack Reminder'
  const notifMessage = `It's time to take ${medication.name}${medication.dosage ? ` — ${medication.dosage}` : ''}.`

  let pushSent = 0
  let pushFailed = 0
  let pushExpired = 0
  let totalActiveSubscriptionsCount = 0

  let shouldSendWebPush = isVapidConfigured() && (!settings || settings.medicationReminders !== false)
  let transientFailureDetected = false

  if (shouldSendWebPush) {
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))

    totalActiveSubscriptionsCount = subscriptions.length

    for (const sub of subscriptions) {
      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: notifTitle,
          body: notifMessage,
          tag: `meditrack-reminder-${occurrenceKey}`,
          url: '/medicines',
        },
      )

      if (result.ok) {
        pushSent++
      } else if (result.expired) {
        pushExpired++
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        console.log(`[reminders/send] Removed expired subscription ${sub.id}`)
      } else {
        pushFailed++
        transientFailureDetected = true
        console.error(`[reminders/send] Push fail: ${result.error}`)
      }
    }
  }

  // Determine delivery result:
  // If we had active subscriptions to send to, but ALL failed due to transient issues:
  const isAllTransientFailures = totalActiveSubscriptionsCount > 0 && pushSent === 0 && transientFailureDetected

  if (isAllTransientFailures) {
    // Revert state to failed so QStash retry can try again
    await db.update(medicationReminders)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(medicationReminders.id, reminderId))

    console.warn(`[reminders/send] Delivery failed transiently for ${reminderId}. QStash will retry.`)
    return new Response('Transient push notification failure', { status: 500 })
  }

  // 6. Transition to delivered on success
  await db.update(medicationReminders)
    .set({ status: 'delivered', updatedAt: new Date() })
    .where(eq(medicationReminders.id, reminderId))

  // 7. Write to in-app notifications
  await db.insert(notifications).values({
    userId,
    medicationId,
    occurrenceKey,
    title: notifTitle,
    message: notifMessage,
  }).onConflictDoNothing({ target: [notifications.userId, notifications.occurrenceKey, notifications.type] })

  // 8. Schedule next daily occurrence
  const timezone = settings?.timezone || 'UTC'
  const timeOfDay = schedule.timeOfDay

  await scheduleReminder({
    userId,
    medicationId,
    scheduleId,
    timeOfDay,
    timezone,
    afterDate: reminder.scheduledFor,
  }).catch((err) => {
    console.error('[reminders/send] Failed to schedule next occurrence:', err instanceof Error ? err.message : err)
  })

  console.log(`[reminders/send] ✅ Delivered ${reminderId}. push_sent=${pushSent} push_failed=${pushFailed} push_expired=${pushExpired}`)

  return NextResponse.json({
    ok: true,
    reminderId,
    pushSent,
    pushFailed,
    pushExpired,
  })
}

export const POST = verifySignatureAppRouter(handler)

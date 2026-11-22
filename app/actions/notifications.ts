'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationReminders, medicationSchedules, medications, notifications, notificationSettings, pushSubscriptions } from '@/lib/db/schema'
import { occurrenceKey } from '@/lib/medication-rules'
import { dueDosesToday } from '@/lib/due-notifications'
import { isAllowedPushEndpoint, isValidPushKey } from '@/lib/push-endpoint'
import { localDatetimeToUtc } from '@/lib/scheduler'
import { takeDose } from './doses'
import { isVapidConfigured } from '@/lib/web-push'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getNotificationState(endpoint?: string) {
  const userId = await getUserId()
  await generateDueNotificationsForUser(userId)
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1)
  const rows = await listNotifications(userId)
  
  const [subscription] = endpoint ? await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1) : []

  return {
    settings: settings ?? { userId, medicationReminders: true, browserNotifications: false, reminderMinutesBefore: 0, timezone: 'UTC', updatedAt: new Date() },
    notifications: rows,
    /** Safe to send to client — this is the VAPID public key only */
    publicVapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    /** Whether VAPID is fully configured on the server (both keys present) */
    vapidConfigured: isVapidConfigured(),
    hasActiveSubscription: Boolean(subscription) && Boolean(settings?.browserNotifications),
  }
}

export async function refreshNotifications() {
  return listNotifications(await getUserId())
}

function listNotifications(userId: string) {
  return db.select().from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.dismissed, false)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(20)
}

export async function updateNotificationSettings(input: { medicationReminders?: boolean; browserNotifications?: boolean; timezone?: string }) {
  const userId = await getUserId()
  await db.insert(notificationSettings).values({
    userId,
    medicationReminders: input.medicationReminders ?? true,
    browserNotifications: input.browserNotifications ?? false,
    timezone: input.timezone || 'UTC',
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: notificationSettings.userId,
    set: {
      medicationReminders: input.medicationReminders ?? true,
      browserNotifications: input.browserNotifications ?? false,
      timezone: input.timezone || 'UTC',
      updatedAt: new Date(),
    },
  })
  revalidatePath('/')
}

export async function markNotificationRead(id: number) {
  const userId = await getUserId()
  await db.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  revalidatePath('/')
}

export async function takeNotificationDose(id: number) {
  const userId = await getUserId()
  const [notification] = await db.select().from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), eq(notifications.dismissed, false))).limit(1)
  if (!notification?.medicationId || notification.type !== 'medication_due') throw new Error('Dose reminder not found.')

  const [reminder] = await db.select({ scheduledFor: medicationReminders.scheduledFor }).from(medicationReminders)
    .where(and(eq(medicationReminders.userId, userId), eq(medicationReminders.medicationId, notification.medicationId), eq(medicationReminders.occurrenceKey, notification.occurrenceKey))).limit(1)
  let scheduledAt = reminder?.scheduledFor

  if (!scheduledAt) {
    // Legacy in-app reminders encode their wall-clock time in the occurrence key.
    const [medicationId, occurrence] = notification.occurrenceKey.split(/:(?=\d{4}-)/)
    const match = occurrence?.match(/^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):([0-5]\d))?$/)
    if (medicationId !== String(notification.medicationId) || !match) throw new Error('Reminder has no scheduled dose.')
    const [, date, hour = '00', minute = '00'] = match
    const [settings] = await db.select({ timezone: notificationSettings.timezone }).from(notificationSettings)
      .where(eq(notificationSettings.userId, userId)).limit(1)
    scheduledAt = localDatetimeToUtc(date, `${hour}:${minute}`, settings?.timezone ?? 'UTC')
  }

  await takeDose(notification.medicationId, scheduledAt)
  await db.update(notifications).set({ read: true, dismissed: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
}

export async function dismissNotification(id: number) {
  const userId = await getUserId()
  await db.update(notifications).set({ read: true, dismissed: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  revalidatePath('/')
}

export async function removePushSubscription(endpoint: string) {
  const userId = await getUserId()
  if (!isAllowedPushEndpoint(endpoint)) throw new Error('Invalid push endpoint.')
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
}

export async function savePushSubscription(subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) {
  const userId = await getUserId()
  if (!isAllowedPushEndpoint(subscription.endpoint) || !isValidPushKey(subscription.keys?.p256dh) || !isValidPushKey(subscription.keys?.auth)) throw new Error('Invalid subscription.')
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updatedAt: new Date() },
  })
}

// Not exported: every export of a 'use server' file is a public endpoint, and this takes a userId.
async function generateDueNotificationsForUser(userId: string, now = new Date()) {
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1)
  if (settings && !settings.medicationReminders) return

  const rows = await db.select({ medication: medications, schedule: medicationSchedules }).from(medicationSchedules).innerJoin(medications, eq(medicationSchedules.medicationId, medications.id)).where(and(eq(medicationSchedules.userId, userId), eq(medicationSchedules.enabled, true), eq(medications.active, true)))
  const medicationsById = new Map(rows.map(({ medication }) => [medication.id, medication]))
  const due = dueDosesToday(rows.map(({ medication, schedule }) => ({ medicationId: medication.id, timeOfDay: schedule.timeOfDay })), now, settings?.timezone ?? 'UTC')
  for (const { medicationId, scheduledAt, occurrenceKey: key, notificationKey } of due) {
    const medication = medicationsById.get(medicationId)
    if (!medication) continue
    const [taken] = await db.select({ id: medicationLogs.id }).from(medicationLogs).where(and(eq(medicationLogs.userId, userId), eq(medicationLogs.medicationId, medicationId), eq(medicationLogs.occurrenceKey, key), eq(medicationLogs.status, 'taken'))).limit(1)
    if (taken) continue
    const [log] = await db.insert(medicationLogs).values({ userId, medicationId, scheduledAt, status: 'scheduled', occurrenceKey: key }).onConflictDoUpdate({ target: [medicationLogs.userId, medicationLogs.occurrenceKey], set: { status: 'scheduled' }, setWhere: eq(medicationLogs.status, 'scheduled') }).returning()
    if (!log) continue
    await db.insert(notifications).values({
      userId,
      medicationId,
      doseOccurrenceId: log.id,
      occurrenceKey: notificationKey,
      title: `${medication.name} is due`,
      message: `${medication.name} ${medication.dosage} is due.`,
    }).onConflictDoNothing({ target: [notifications.userId, notifications.occurrenceKey, notifications.type] })
  }
}

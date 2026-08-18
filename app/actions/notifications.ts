'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationSchedules, medications, notifications, notificationSettings, pushSubscriptions } from '@/lib/db/schema'
import { occurrenceKey } from '@/lib/medication-rules'
import { isVapidConfigured } from '@/lib/web-push'
import { and, count, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getNotificationState() {
  const userId = await getUserId()
  await generateDueNotificationsForUser(userId)
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1)
  const rows = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.dismissed, false))).orderBy(desc(notifications.createdAt)).limit(20)
  
  // Count active push subscriptions for the user
  const [subCountRow] = await db
    .select({ count: count() })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  return {
    settings: settings ?? { userId, medicationReminders: true, browserNotifications: false, reminderMinutesBefore: 0, timezone: 'UTC', updatedAt: new Date() },
    notifications: rows,
    /** Safe to send to client — this is the VAPID public key only */
    publicVapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    /** Whether VAPID is fully configured on the server (both keys present) */
    vapidConfigured: isVapidConfigured(),
    /** Whether the user has at least one active push subscription */
    hasActiveSubscription: Number(subCountRow?.count ?? 0) > 0,
  }
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

export async function dismissNotification(id: number) {
  const userId = await getUserId()
  await db.update(notifications).set({ read: true, dismissed: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
  revalidatePath('/')
}

export async function savePushSubscription(subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }) {
  const userId = await getUserId()
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys.auth) throw new Error('Invalid subscription.')
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

export async function generateDueNotificationsForUser(userId: string, now = new Date()) {
  const [settings] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1)
  if (settings && !settings.medicationReminders) return

  const rows = await db.select({ medication: medications, schedule: medicationSchedules }).from(medicationSchedules).innerJoin(medications, eq(medicationSchedules.medicationId, medications.id)).where(and(eq(medicationSchedules.userId, userId), eq(medicationSchedules.enabled, true), eq(medications.active, true)))
  const today = now.toISOString().slice(0, 10)
  for (const row of rows) {
    const scheduledAt = new Date(`${today}T${row.schedule.timeOfDay || '08:00'}:00`)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt > now) continue
    const key = occurrenceKey(row.medication.id, scheduledAt)
    const [taken] = await db.select({ id: medicationLogs.id }).from(medicationLogs).where(and(eq(medicationLogs.userId, userId), eq(medicationLogs.medicationId, row.medication.id), eq(medicationLogs.occurrenceKey, key), eq(medicationLogs.status, 'taken'))).limit(1)
    if (taken) continue
    const [log] = await db.insert(medicationLogs).values({ userId, medicationId: row.medication.id, scheduledAt, status: 'scheduled', occurrenceKey: key }).onConflictDoUpdate({ target: [medicationLogs.userId, medicationLogs.occurrenceKey], set: { status: 'scheduled' } }).returning()
    await db.insert(notifications).values({
      userId,
      medicationId: row.medication.id,
      doseOccurrenceId: log.id,
      occurrenceKey: key,
      title: `${row.medication.name} is due`,
      message: `${row.medication.name} ${row.medication.dosage} is due.`,
    }).onConflictDoNothing({ target: [notifications.userId, notifications.occurrenceKey, notifications.type] })
  }
}

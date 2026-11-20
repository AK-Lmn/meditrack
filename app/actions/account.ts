'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { account, medicationLogs, medicationReminders, medicationSchedules, medications, notifications, notificationSettings, pushSubscriptions, session, user, verification } from '@/lib/db/schema'
import { cancelQueuedMessages } from '@/lib/reminder-scheduler'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { after } from 'next/server'

export async function deleteCurrentAccount(password: string, confirmation: string) {
  if (confirmation !== 'DELETE' || !password) throw new Error('Confirm account deletion first.')
  const requestHeaders = await headers()
  const current = await auth.api.getSession({ headers: requestHeaders })
  if (!current?.user) throw new Error('Sign in before deleting your account.')
  const verified = await auth.api.verifyPassword({ body: { password }, headers: requestHeaders })
  if (!verified.status) throw new Error('Password verification failed.')

  const id = current.user.id
  const queued = await db.transaction(async (tx) => {
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id))
    await tx.delete(notificationSettings).where(eq(notificationSettings.userId, id))
    await tx.delete(notifications).where(eq(notifications.userId, id))
    const reminders = await tx.delete(medicationReminders).where(eq(medicationReminders.userId, id))
      .returning({ qstashMessageId: medicationReminders.qstashMessageId })
    await tx.delete(medicationLogs).where(eq(medicationLogs.userId, id))
    await tx.delete(medicationSchedules).where(eq(medicationSchedules.userId, id))
    await tx.delete(medications).where(eq(medications.userId, id))
    await tx.delete(verification).where(eq(verification.value, id))
    await tx.delete(session).where(eq(session.userId, id))
    await tx.delete(account).where(eq(account.userId, id))
    await tx.delete(user).where(eq(user.id, id))
    return reminders
  })
  after(() => cancelQueuedMessages(queued))
  revalidatePath('/', 'layout')
}

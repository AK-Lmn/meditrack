'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medications } from '@/lib/db/schema'
import { occurrenceKey } from '@/lib/medication-rules'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function listTodayDoses() {
  const userId = await getUserId()
  return db.select({ log: medicationLogs, medication: medications }).from(medicationLogs).innerJoin(medications, eq(medicationLogs.medicationId, medications.id)).where(and(eq(medicationLogs.userId, userId), eq(medications.active, true))).orderBy(desc(medicationLogs.scheduledAt))
}

export async function takeDose(medicationId: number, scheduledAt = new Date()) {
  return recordDoseStatus(medicationId, 'taken', scheduledAt)
}

export async function undoDose(medicationId: number, scheduledAt = new Date()) {
  return recordDoseStatus(medicationId, 'scheduled', scheduledAt)
}

export async function recordDoseStatus(
  medicationId: number,
  status: 'scheduled' | 'taken' | 'missed' | 'skipped',
  scheduledAt = new Date()
) {
  const userId = await getUserId()
  const [owned] = await db
    .select({ id: medications.id })
    .from(medications)
    .where(and(eq(medications.id, medicationId), eq(medications.userId, userId), eq(medications.active, true)))
    .limit(1)
  if (!owned) throw new Error('Medication not found.')

  const key = occurrenceKey(medicationId, scheduledAt)
  const isTaken = status === 'taken'
  const takenAt = isTaken ? new Date() : null

  await db
    .insert(medicationLogs)
    .values({
      userId,
      medicationId,
      scheduledAt,
      takenAt,
      status,
      occurrenceKey: key,
    })
    .onConflictDoUpdate({
      target: [medicationLogs.userId, medicationLogs.occurrenceKey],
      set: {
        takenAt,
        status,
      },
    })

  revalidatePath('/')
}


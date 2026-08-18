'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationSchedules, medications, notificationSettings } from '@/lib/db/schema'
import { cleanText, medicationColors, requireDosage, requireMedicationName } from '@/lib/medication-rules'
import { scheduleReminder, cancelRemindersForMedication } from '@/lib/reminder-scheduler'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function listMedications() {
  const userId = await getUserId()
  return db.select().from(medications).where(eq(medications.userId, userId)).orderBy(desc(medications.createdAt))
}

export async function createMedication(input: { name: unknown; dosage: unknown; frequency?: unknown; instructions?: unknown; color?: unknown; timeOfDay?: unknown }) {
  const userId = await getUserId()

  const [medication] = await db.insert(medications).values({
    userId,
    name: requireMedicationName(input.name),
    dosage: requireDosage(input.dosage),
    frequency: cleanText(input.frequency, 40) || 'Once daily',
    instructions: cleanText(input.instructions, 240) || null,
    color: medicationColors.includes(input.color as MedicationColor) ? input.color as MedicationColor : 'sky',
  }).returning()

  const timeOfDay = cleanText(input.timeOfDay, 20) || '08:00'

  const [schedule] = await db.insert(medicationSchedules).values({
    userId,
    medicationId: medication.id,
    timeOfDay,
    frequency: medication.frequency,
  }).returning()

  // Schedule first QStash reminder using the user's stored timezone.
  // This is intentionally non-blocking — a scheduling failure should not
  // prevent the medication from being saved. The user will still see the
  // medication in the UI and the in-app notification system still functions.
  const [userSettings] = await db
    .select({ timezone: notificationSettings.timezone })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1)

  const timezone = userSettings?.timezone || 'UTC'

  scheduleReminder({
    userId,
    medicationId: medication.id,
    scheduleId: schedule.id,
    timeOfDay,
    timezone,
  }).catch((err) => {
    console.error('[createMedication] Failed to schedule reminder:', err instanceof Error ? err.message : err)
  })

  revalidatePath('/')
  return medication
}

type MedicationColor = (typeof medicationColors)[number]

export async function archiveMedication(id: number) {
  const userId = await getUserId()

  // Mark medication inactive
  await db.update(medications)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))

  // Disable all schedules
  await db.update(medicationSchedules)
    .set({ enabled: false })
    .where(and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId)))

  // Cancel all pending QStash reminders and mark them cancelled in DB.
  // Even if QStash cancel fails, the DB cancelled=true flag prevents delivery.
  cancelRemindersForMedication(id, userId).catch((err) => {
    console.error('[archiveMedication] Failed to cancel reminders:', err instanceof Error ? err.message : err)
  })

  revalidatePath('/')
}

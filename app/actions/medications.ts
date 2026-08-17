'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationSchedules, medications } from '@/lib/db/schema'
import { cleanText, medicationColors, requireDosage, requireMedicationName } from '@/lib/medication-rules'
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
  await db.insert(medicationSchedules).values({ userId, medicationId: medication.id, timeOfDay: cleanText(input.timeOfDay, 20) || '08:00', frequency: medication.frequency })
  revalidatePath('/')
  return medication
}

type MedicationColor = (typeof medicationColors)[number]

export async function archiveMedication(id: number) {
  const userId = await getUserId()
  await db.update(medications).set({ active: false, updatedAt: new Date() }).where(and(eq(medications.id, id), eq(medications.userId, userId)))
  await db.update(medicationSchedules).set({ enabled: false }).where(and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId)))
  revalidatePath('/')
}

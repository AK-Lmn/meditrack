'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationReminders, medicationSchedules, medications, notifications, notificationSettings } from '@/lib/db/schema'
import { cleanText, medicationColors, requireDosage, requireMedicationName } from '@/lib/medication-rules'
import { scheduleReminder, cancelQueuedMessages } from '@/lib/reminder-scheduler'
import { validateTimeFormat } from '@/lib/validation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function listMedications() {
  const userId = await getUserId()
  return db.select().from(medications).where(eq(medications.userId, userId)).orderBy(desc(medications.createdAt))
}

type MedicationInput = { name: unknown; dosage: unknown; frequency?: unknown; instructions?: unknown; color?: unknown; timeOfDay?: unknown; secondTimeOfDay?: unknown; scheduleTimes?: unknown }

function medicationFields(input: MedicationInput) {
  const legacyFrequency = cleanText(input.frequency, 40) || 'Once daily'
  const legacyTimes = [cleanText(input.timeOfDay, 20) || '08:00']
  if (legacyFrequency.toLowerCase() === 'twice daily') {
    legacyTimes.push(cleanText(input.secondTimeOfDay, 20) || '20:00')
  }
  const rawTimes = input.scheduleTimes === undefined ? legacyTimes : input.scheduleTimes
  if (!Array.isArray(rawTimes) || !rawTimes.length || rawTimes.length > 1440) {
    throw new Error('Choose a valid, distinct due time for each dose.')
  }
  const validatedTimes = Array.from(rawTimes, validateTimeFormat)
  const times = validatedTimes.map(({ value }) => value).sort()
  if (validatedTimes.some(({ valid }) => !valid) || new Set(times).size !== times.length) {
    throw new Error('Choose a valid, distinct due time for each dose.')
  }
  const frequency = input.scheduleTimes === undefined || legacyFrequency.toLowerCase().includes('needed')
    ? legacyFrequency
    : times.length === 1 ? 'Once daily' : times.length === 2 ? 'Twice daily' : `${times.length} times daily`
  return { name: requireMedicationName(input.name), dosage: requireDosage(input.dosage), frequency, times }
}

export async function createMedication(input: MedicationInput) {
  const userId = await getUserId()
  const { name, dosage, frequency, times } = medicationFields(input)

  const { medication, schedules } = await db.transaction(async (tx) => {
    const [medication] = await tx.insert(medications).values({
      userId,
      name,
      dosage,
      frequency,
      instructions: cleanText(input.instructions, 240) || null,
      color: medicationColors.includes(input.color as MedicationColor) ? input.color as MedicationColor : 'sky',
    }).returning()
    const schedules = await tx.insert(medicationSchedules).values(times.map((timeOfDay) => ({
      userId,
      medicationId: medication.id,
      timeOfDay,
      frequency,
    }))).returning()
    return { medication, schedules }
  })

  after(() => scheduleMedicationReminders(userId, medication.id, schedules))
  revalidatePath('/', 'layout')
  return medication
}

async function scheduleMedicationReminders(userId: string, medicationId: number, schedules: { id: number; timeOfDay: string }[]) {
  const [userSettings] = await db
    .select({ timezone: notificationSettings.timezone })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1)

  const timezone = userSettings?.timezone || 'UTC'

  await Promise.all(schedules.map((schedule) => scheduleReminder({ userId, medicationId, scheduleId: schedule.id, timeOfDay: schedule.timeOfDay, timezone })))
}

type MedicationColor = (typeof medicationColors)[number]

export async function archiveMedication(id: number) {
  const userId = await getUserId()
  const cancelled = await db.transaction(async (tx) => {
    const [medication] = await tx.update(medications).set({ active: false, updatedAt: new Date() })
      .where(and(eq(medications.id, id), eq(medications.userId, userId), eq(medications.active, true))).returning({ id: medications.id })
    if (!medication) return []
    await tx.update(medicationSchedules).set({ enabled: false })
      .where(and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId)))
    await tx.update(notifications).set({ read: true, dismissed: true })
      .where(and(eq(notifications.medicationId, id), eq(notifications.userId, userId)))
    return tx.update(medicationReminders).set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(medicationReminders.medicationId, id), eq(medicationReminders.userId, userId), inArray(medicationReminders.status, ['pending', 'failed', 'processing'])))
      .returning({ qstashMessageId: medicationReminders.qstashMessageId })
  })
  after(() => cancelQueuedMessages(cancelled))
  revalidatePath('/', 'layout')
}

export async function editMedication(id: number, input: MedicationInput) {
  const userId = await getUserId()
  const { name, dosage, frequency, times } = medicationFields(input)
  const data = await db.transaction(async (tx) => {
    const [owned] = await tx.update(medications).set({ name, dosage, frequency, updatedAt: new Date() })
      .where(and(eq(medications.id, id), eq(medications.userId, userId), eq(medications.active, true))).returning({ id: medications.id })
    if (!owned) throw new Error('Active medication not found.')
    const scope = and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId))
    const existing = await tx.select().from(medicationSchedules).where(scope)
    const retained = existing.filter((schedule) => schedule.enabled && times.includes(schedule.timeOfDay))
    const removed = existing.filter((schedule) => !retained.includes(schedule)).map((schedule) => schedule.id)
    const added = times.filter((time) => !retained.some((schedule) => schedule.timeOfDay === time))
    const cancelled = removed.length ? await tx.update(medicationReminders).set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(medicationReminders.userId, userId), inArray(medicationReminders.scheduleId, removed), inArray(medicationReminders.status, ['pending', 'failed', 'processing'])))
      .returning({ qstashMessageId: medicationReminders.qstashMessageId }) : []
    if (removed.length) await tx.delete(medicationSchedules).where(and(scope, inArray(medicationSchedules.id, removed)))
    if (retained.length) await tx.update(medicationSchedules).set({ frequency }).where(and(scope, inArray(medicationSchedules.id, retained.map((schedule) => schedule.id))))
    const schedules = added.length ? await tx.insert(medicationSchedules).values(added.map((timeOfDay) => ({ userId, medicationId: id, timeOfDay, frequency }))).returning() : []
    return { cancelled, schedules }
  })
  after(async () => {
    await Promise.all([cancelQueuedMessages(data.cancelled), scheduleMedicationReminders(userId, id, data.schedules)])
  })
  revalidatePath('/', 'layout')
}

export async function restoreMedication(id: number) {
  const userId = await getUserId()
  const schedules = await db.transaction(async (tx) => {
    const [owned] = await tx.update(medications).set({ active: true, updatedAt: new Date() })
      .where(and(eq(medications.id, id), eq(medications.userId, userId), eq(medications.active, false))).returning({ id: medications.id })
    if (!owned) throw new Error('Archived medication not found.')
    return tx.update(medicationSchedules).set({ enabled: true })
      .where(and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId))).returning()
  })
  after(() => scheduleMedicationReminders(userId, id, schedules))
  revalidatePath('/', 'layout')
}

export async function deleteMedication(id: number) {
  const userId = await getUserId()
  const cancelled = await db.transaction(async (tx) => {
    const [owned] = await tx.delete(medications).where(and(eq(medications.id, id), eq(medications.userId, userId))).returning({ id: medications.id })
    if (!owned) throw new Error('Medication not found.')
    await tx.delete(medicationLogs).where(and(eq(medicationLogs.medicationId, id), eq(medicationLogs.userId, userId)))
    await tx.delete(notifications).where(and(eq(notifications.medicationId, id), eq(notifications.userId, userId)))
    await tx.delete(medicationSchedules).where(and(eq(medicationSchedules.medicationId, id), eq(medicationSchedules.userId, userId)))
    return tx.delete(medicationReminders).where(and(eq(medicationReminders.medicationId, id), eq(medicationReminders.userId, userId)))
      .returning({ qstashMessageId: medicationReminders.qstashMessageId })
  })
  after(() => cancelQueuedMessages(cancelled))
  revalidatePath('/', 'layout')
}

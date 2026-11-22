import { and, eq, gt, inArray, lte, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { medicationLogs, medicationReminders, medicationSchedules, medications, notificationSettings } from '@/lib/db/schema'
import { missedDosesToRecord } from '@/lib/missed-doses'
import { formatDateForTimeZone } from '@/lib/timezone-display'

async function reconcileMedication(id: number, now: Date) {
  return db.transaction(async (tx) => {
    const [medication] = await tx.select().from(medications)
      .where(eq(medications.id, id)).limit(1).for('update')
    if (!medication || medication.frequency.toLowerCase().includes('needed')) return 0
    const { userId, active, updatedAt } = medication
    const [[settings], schedules, logs] = await Promise.all([
      tx.select({ timezone: notificationSettings.timezone }).from(notificationSettings)
        .where(eq(notificationSettings.userId, userId)).limit(1),
      tx.select({ time: medicationSchedules.timeOfDay }).from(medicationSchedules)
        .where(and(eq(medicationSchedules.userId, userId), eq(medicationSchedules.medicationId, id),
          active ? eq(medicationSchedules.enabled, true) : undefined)),
      tx.select({ id: medicationLogs.id, medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt })
        .from(medicationLogs).where(and(eq(medicationLogs.userId, userId), eq(medicationLogs.medicationId, id))),
    ])
    const reminders = active ? [] : await tx.select({ scheduledFor: medicationReminders.scheduledFor })
      .from(medicationReminders).where(and(
        eq(medicationReminders.userId, userId),
        eq(medicationReminders.medicationId, id),
        lte(medicationReminders.scheduledFor, updatedAt),
        // A reminder cancelled before it was due is not evidence of a missed dose.
        or(ne(medicationReminders.status, 'cancelled'), gt(medicationReminders.updatedAt, medicationReminders.scheduledFor)),
      ))
    const timezone = settings && formatDateForTimeZone(settings.timezone, now) ? settings.timezone : 'UTC'
    const candidates = missedDosesToRecord([{
      ...medication,
      times: schedules.map(({ time }) => time),
      archive: active ? undefined : { at: updatedAt, reminderTimes: reminders.map(({ scheduledFor }) => scheduledFor) },
    }], logs, now, timezone)
    const pendingByTime = new Map(logs.filter(({ status }) => status === 'scheduled')
      .map((log) => [log.scheduledAt.getTime(), log.id]))

    let recorded = 0
    for (let start = 0; start < candidates.length; start += 500) {
      const batch = candidates.slice(start, start + 500)
      const existingIds = batch.flatMap(({ scheduledAt }) => {
        const id = pendingByTime.get(scheduledAt.getTime())
        return id === undefined ? [] : [id]
      })
      if (existingIds.length) {
        const updated = await tx.update(medicationLogs).set({ status: 'missed' })
          .where(and(eq(medicationLogs.userId, userId), eq(medicationLogs.status, 'scheduled'), inArray(medicationLogs.id, existingIds)))
          .returning({ id: medicationLogs.id })
        recorded += updated.length
      }
      const missing = batch.filter(({ scheduledAt }) => !pendingByTime.has(scheduledAt.getTime()))
      if (missing.length) {
        const inserted = await tx.insert(medicationLogs)
          .values(missing.map((dose) => ({ ...dose, userId, status: 'missed' })))
          .onConflictDoUpdate({
            target: [medicationLogs.userId, medicationLogs.occurrenceKey],
            set: { status: 'missed' },
            setWhere: eq(medicationLogs.status, 'scheduled'),
          }).returning({ id: medicationLogs.id })
        recorded += inserted.length
      }
    }
    return recorded
  })
}

export async function reconcileMissedDoses(now = new Date()) {
  const rows = await db.select({ id: medications.id }).from(medications).orderBy(medications.id)
  let recorded = 0
  for (let start = 0; start < rows.length; start += 8) {
    const counts = await Promise.all(rows.slice(start, start + 8).map(({ id }) => reconcileMedication(id, now)))
    recorded += counts.reduce((total, count) => total + count, 0)
  }
  return recorded
}

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationSchedules, medications, notificationSettings } from '@/lib/db/schema'
import { addDaysToDateString, formatLocalDate, generateDailyOccurrences } from '@/lib/scheduler'
import { dosesScheduledFrom } from '@/lib/missed-doses'
import { formatDateForTimeZone } from '@/lib/timezone-display'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MediTrackDashboard from '@/components/meditrack-dashboard'

export function TimedDashboardPage() {
  return renderDashboard(true)
}

export function DashboardPage() {
  return renderDashboard(false)
}

async function renderDashboard(measureTiming: boolean) {
  const startedAt = performance.now()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const sessionReadyAt = performance.now()
  const [medicationRows, [settingsRow], schedules, doseRows] = await Promise.all([
    db.select().from(medications).where(eq(medications.userId, session.user.id)),
    db.select({ timezone: notificationSettings.timezone }).from(notificationSettings).where(eq(notificationSettings.userId, session.user.id)).limit(1),
    db.select({ medicationId: medicationSchedules.medicationId, timeOfDay: medicationSchedules.timeOfDay }).from(medicationSchedules).where(and(eq(medicationSchedules.userId, session.user.id), eq(medicationSchedules.enabled, true))),
    db.select({ id: medicationLogs.id, medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt, takenAt: medicationLogs.takenAt }).from(medicationLogs).where(eq(medicationLogs.userId, session.user.id)),
  ])
  const dataReadyAt = performance.now()
  const now = new Date()
  const localDate = formatDateForTimeZone(settingsRow?.timezone, now)
  const timezone = localDate ? settingsRow.timezone : null
  const scheduleTimezone = timezone ?? 'UTC'
  const today = formatLocalDate(now, scheduleTimezone)
  const recentOccurrences = medicationRows.filter((medication) => medication.active).map((medication) => ({
    ...medication,
    occurrences: medication.frequency.toLowerCase().includes('needed') ? [] : generateDailyOccurrences(
      medication.id,
      schedules.filter((schedule) => schedule.medicationId === medication.id).map((schedule) => schedule.timeOfDay),
      addDaysToDateString(today, -1),
      2,
      scheduleTimezone,
    ),
  }))
  const medicationsById = new Map(medicationRows.map((medication) => [medication.id, medication]))
  const doses = doseRows
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime() || b.id - a.id)
    .map((dose) => {
      const medication = medicationsById.get(dose.medicationId)
      return { ...dose, name: medication?.name ?? 'Medication unavailable', dosage: medication?.dosage ?? null }
    })
  const scheduledMedications = recentOccurrences.map(({ occurrences, ...medication }) => ({
    ...medication,
    scheduleTimes: schedules.filter((schedule) => schedule.medicationId === medication.id).map((schedule) => schedule.timeOfDay).sort(),
    todayOccurrences: dosesScheduledFrom(occurrences.filter((dose) => dose.localDate === today), medication.createdAt),
  }))
  const archived = medicationRows.filter((medication) => !medication.active).map(({ id, name, dosage }) => ({ id, name, dosage }))
  if (measureTiming) {
    const preparedAt = performance.now()
    console.info('[dashboard-timing]', {
      route: '/',
      sessionMs: Math.round(sessionReadyAt - startedAt),
      databaseMs: Math.round(dataReadyAt - sessionReadyAt),
      preparationMs: Math.round(preparedAt - dataReadyAt),
      totalMs: Math.round(preparedAt - startedAt),
    })
  }
  return <MediTrackDashboard key={session.user.id} medications={scheduledMedications} archivedMedications={archived} doses={doses} user={{ name: session.user.name, email: session.user.email }} initialTimezone={timezone} initialNow={now.getTime()} />
}

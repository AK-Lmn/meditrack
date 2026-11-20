import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationSchedules, medications, notificationSettings } from '@/lib/db/schema'
import { addDaysToDateString, formatLocalDate, generateDailyOccurrences, getDoseDisplayStatus } from '@/lib/scheduler'
import { occurrenceKey } from '@/lib/medication-rules'
import { formatDateForTimeZone, getGreetingForTimeZone } from '@/lib/timezone-display'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MediTrackDashboard from '@/components/meditrack-dashboard'

export async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [medicationRows, [settingsRow], schedules, doseRows] = await Promise.all([
    db.select().from(medications).where(and(eq(medications.userId, session.user.id), eq(medications.active, true))),
    db.select({ timezone: notificationSettings.timezone }).from(notificationSettings).where(eq(notificationSettings.userId, session.user.id)).limit(1),
    db.select({ medicationId: medicationSchedules.medicationId, timeOfDay: medicationSchedules.timeOfDay }).from(medicationSchedules).where(and(eq(medicationSchedules.userId, session.user.id), eq(medicationSchedules.enabled, true))),
    db.select({ medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt }).from(medicationLogs).where(eq(medicationLogs.userId, session.user.id)),
  ])
  const timezone = settingsRow?.timezone ?? null
  const now = new Date()
  const scheduleTimezone = timezone ?? 'UTC'
  const today = formatLocalDate(now, scheduleTimezone)
  const recentOccurrences = medicationRows.map((medication) => ({
    ...medication,
    occurrences: medication.frequency.toLowerCase().includes('needed') ? [] : generateDailyOccurrences(
      medication.id,
      schedules.filter((schedule) => schedule.medicationId === medication.id).map((schedule) => schedule.timeOfDay),
      addDaysToDateString(today, -1),
      2,
      scheduleTimezone,
    ),
  }))
  const missed = recentOccurrences.flatMap((medication) => medication.occurrences
    .filter((dose) => dose.localDate >= formatLocalDate(medication.createdAt, scheduleTimezone) && getDoseDisplayStatus(dose.scheduledUtc, now) === 'missed')
    .filter((dose) => !doseRows.some((log) => log.medicationId === medication.id && (
      (log.status !== 'scheduled' && log.scheduledAt.getTime() === dose.scheduledUtc.getTime())
      || (log.status === 'taken' && medication.occurrences.length === 2 && formatLocalDate(log.scheduledAt, scheduleTimezone) === dose.localDate)
    )))
    .map(({ scheduledUtc }) => ({ userId: session.user.id, medicationId: medication.id, scheduledAt: scheduledUtc, occurrenceKey: occurrenceKey(medication.id, scheduledUtc), status: 'missed' })))
  const recordedMissed = missed.length
    ? await db.insert(medicationLogs).values(missed).onConflictDoUpdate({
      target: [medicationLogs.userId, medicationLogs.occurrenceKey],
      set: { status: 'missed' },
      setWhere: eq(medicationLogs.status, 'scheduled'),
    }).returning({ medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt }) : []
  const recordedKeys = new Set(recordedMissed.map((dose) => occurrenceKey(dose.medicationId, dose.scheduledAt)))
  const doses = [...recordedMissed, ...doseRows.filter((dose) => !recordedKeys.has(occurrenceKey(dose.medicationId, dose.scheduledAt)))]
  const scheduledMedications = recentOccurrences.map(({ occurrences, ...medication }) => ({
    ...medication,
    todayOccurrences: occurrences.filter((dose) => dose.localDate === today),
  }))
  return <MediTrackDashboard key={session.user.id} medications={scheduledMedications} doses={doses} user={{ name: session.user.name, email: session.user.email }} initialTimezone={timezone} initialGreeting={getGreetingForTimeZone(timezone, now)} initialLocalDate={formatDateForTimeZone(timezone, now)} initialNow={now.getTime()} />
}

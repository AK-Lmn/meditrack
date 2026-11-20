import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medicationSchedules, medications, notificationSettings } from '@/lib/db/schema'
import { formatLocalDate, generateDailyOccurrences } from '@/lib/scheduler'
import { formatDateForTimeZone, getGreetingForTimeZone } from '@/lib/timezone-display'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MediTrackDashboard from '@/components/meditrack-dashboard'

export async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [medicationRows, doseRows, [settingsRow], schedules] = await Promise.all([
    db.select().from(medications).where(and(eq(medications.userId, session.user.id), eq(medications.active, true))),
    db.select({ medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt }).from(medicationLogs).where(eq(medicationLogs.userId, session.user.id)),
    db.select({ timezone: notificationSettings.timezone }).from(notificationSettings).where(eq(notificationSettings.userId, session.user.id)).limit(1),
    db.select({ medicationId: medicationSchedules.medicationId, timeOfDay: medicationSchedules.timeOfDay }).from(medicationSchedules).where(and(eq(medicationSchedules.userId, session.user.id), eq(medicationSchedules.enabled, true))),
  ])
  const timezone = settingsRow?.timezone ?? null
  const now = new Date()
  const scheduleTimezone = timezone ?? 'UTC'
  const today = formatLocalDate(now, scheduleTimezone)
  const scheduledMedications = medicationRows.map((medication) => ({
    ...medication,
    todayOccurrences: medication.frequency.toLowerCase().includes('needed') ? [] : generateDailyOccurrences(
      medication.id,
      schedules.filter((schedule) => schedule.medicationId === medication.id).map((schedule) => schedule.timeOfDay),
      today,
      1,
      scheduleTimezone,
    ),
  }))
  return <MediTrackDashboard key={session.user.id} medications={scheduledMedications} doses={doseRows} user={{ name: session.user.name, email: session.user.email }} initialTimezone={timezone} initialGreeting={getGreetingForTimeZone(timezone, now)} initialLocalDate={formatDateForTimeZone(timezone, now)} />
}

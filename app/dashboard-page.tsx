import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medications, notificationSettings } from '@/lib/db/schema'
import { formatDateForTimeZone, getGreetingForTimeZone } from '@/lib/timezone-display'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MediTrackDashboard from '@/components/meditrack-dashboard'

export async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [medicationRows, doseRows, [settingsRow]] = await Promise.all([
    db.select().from(medications).where(and(eq(medications.userId, session.user.id), eq(medications.active, true))),
    db.select({ medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt }).from(medicationLogs).where(eq(medicationLogs.userId, session.user.id)),
    db.select({ timezone: notificationSettings.timezone }).from(notificationSettings).where(eq(notificationSettings.userId, session.user.id)).limit(1),
  ])
  const timezone = settingsRow?.timezone ?? null
  const now = new Date()
  return <MediTrackDashboard medications={medicationRows} doses={doseRows} user={{ name: session.user.name, email: session.user.email }} initialTimezone={timezone} initialGreeting={getGreetingForTimeZone(timezone, now)} initialLocalDate={formatDateForTimeZone(timezone, now)} />
}

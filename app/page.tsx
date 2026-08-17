import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { medicationLogs, medications } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MediTrackDashboard from '@/components/meditrack-dashboard'

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  const [medicationRows, doseRows] = await Promise.all([
    db.select().from(medications).where(and(eq(medications.userId, session.user.id), eq(medications.active, true))),
    db.select({ medicationId: medicationLogs.medicationId, status: medicationLogs.status, scheduledAt: medicationLogs.scheduledAt }).from(medicationLogs).where(eq(medicationLogs.userId, session.user.id)),
  ])
  return <MediTrackDashboard medications={medicationRows} doses={doseRows} user={{ name: session.user.name, email: session.user.email }} />
}

import { db } from '@/lib/db'
import { notificationSettings } from '@/lib/db/schema'
import { generateDueNotificationsForUser } from '@/app/actions/notifications'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const settings = await db.select({ userId: notificationSettings.userId }).from(notificationSettings)
  await Promise.all(settings.map((setting) => generateDueNotificationsForUser(setting.userId)))
  return NextResponse.json({ ok: true, checkedUsers: settings.length })
}


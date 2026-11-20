'use client'

import { Analytics } from '@vercel/analytics/next'

export function AppAnalytics() {
  return <Analytics beforeSend={(event) => new URL(event.url).pathname === '/reset-password' ? null : event} />
}

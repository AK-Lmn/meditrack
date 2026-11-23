import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { recordDoseStatus } from '@/app/actions/doses'
import { updateNotificationSettings } from '@/app/actions/notifications'
import Dashboard from '@/components/meditrack-dashboard'
import { ThemeProvider } from '@/components/theme-provider'

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => ({ user: { id: 'test-user' } }) } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({}) }))
vi.mock('@/lib/db', () => ({ db: {
  select: () => { throw new Error('Unexpected database read') },
  insert: () => { throw new Error('Unexpected database write') },
} }))

it('rejects an unsupported timezone before writing settings', async () => {
  await expect(updateNotificationSettings({ timezone: 'Mars/Olympus' })).rejects.toThrow('Invalid timezone')
})

it('rejects a forged dose status before querying medications', async () => {
  await expect(recordDoseStatus(1, 'other' as 'taken')).rejects.toThrow('Invalid dose status')
})

it.each([new Date(NaN), '2026-11-22T00:00:00Z', null])('rejects an invalid scheduledAt: %s', async (scheduledAt) => {
  await expect(recordDoseStatus(1, 'taken', scheduledAt as Date)).rejects.toThrow('Invalid scheduled dose time')
})

it('offers Singapore in the timezone selector', () => {
  const dashboard = createElement(Dashboard, {
    medications: [], archivedMedications: [], doses: [],
    user: { name: 'Test User', email: 'test@example.test' },
    initialTimezone: 'UTC', initialNow: 0,
  })
  const markup = renderToStaticMarkup(createElement(ThemeProvider, { children: dashboard }))
  expect(markup.match(/<select[^>]*aria-label="Timezone"[^>]*>[\s\S]*?<\/select>/)?.[0]).toContain('value="Asia/Singapore"')
})

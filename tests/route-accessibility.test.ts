import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'
import Loading from '@/app/loading'
import * as signIn from '@/app/sign-in/page'
import * as signUp from '@/app/sign-up/page'
import MediTrackDashboard from '@/components/meditrack-dashboard'
import { ThemeProvider } from '@/components/theme-provider'

vi.mock('next/navigation', () => ({ usePathname: () => '/medicines', useRouter: () => ({}) }))

it('provides a keyboard skip target and a separate loading status', async () => {
  const markup = renderToStaticMarkup(await RootLayout({ children: createElement(Loading) }))
  expect(markup).toMatch(/<a[^>]*href="#main-content"[^>]*>Skip to main content<\/a>/)
  expect(markup).toMatch(/<main[^>]*id="main-content"/)
  expect(markup).not.toMatch(/<main[^>]*role="status"/)
  expect(markup).toMatch(/<span[^>]*role="status"/)
})

it('renders the workspace route name as its main heading', () => {
  const dashboard = createElement(MediTrackDashboard, {
    medications: [], archivedMedications: [], doses: [],
    user: { name: 'Test User', email: 'test@example.test' },
    initialTimezone: 'UTC', initialGreeting: null, initialLocalDate: null, initialNow: 0,
  })
  const markup = renderToStaticMarkup(createElement(ThemeProvider, { children: dashboard }))
  expect(markup).toMatch(/<h1[^>]*>Medicines/)
  expect(markup).toMatch(/<main[^>]*id="main-content"[^>]*tabindex="-1"/i)
})

it('gives the two account entry routes distinct titles', () => {
  expect(Reflect.get(signIn, 'metadata')).toMatchObject({ title: 'Sign in' })
  expect(Reflect.get(signUp, 'metadata')).toMatchObject({ title: 'Create account' })
})

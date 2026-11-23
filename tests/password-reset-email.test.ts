import { afterEach, expect, it, vi } from 'vitest'

type ResetMailer = (input: { user: { id: string; email: string }, url: string }) => Promise<void>

const { configureAuth, after, query } = vi.hoisted(() => ({
  configureAuth: vi.fn<(options: { emailAndPassword: { sendResetPassword?: ResetMailer } }) => void>(),
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  query: vi.fn(),
}))

vi.mock('better-auth', () => ({ betterAuth: configureAuth }))
vi.mock('@/lib/db', () => ({ pool: { query } }))
vi.mock('next/server', () => ({ after }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it.each([
  { inbox: 'recovery@agentmail.to', from: undefined, url: 'https://api.agentmail.to/v0/inboxes/recovery%40agentmail.to/messages/send', key: 'agent-test' },
  { inbox: undefined, from: 'recovery@example.test', url: 'https://api.resend.com/emails', key: 'resend-test' },
])('sends the reset link using $url', async ({ inbox, from, url, key }) => {
  vi.resetModules()
  vi.stubEnv('AGENTMAIL_API_KEY', 'agent-test')
  vi.stubEnv('MEDITRACK_AUTH_AGENTMAIL_INBOX', inbox)
  vi.stubEnv('RESEND_API_KEY', 'resend-test')
  vi.stubEnv('MEDITRACK_AUTH_EMAIL_FROM', 'recovery@example.test')
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', fetch)
  query.mockResolvedValueOnce({ rowCount: 1 })

  const { passwordResetEnabled } = await import('@/lib/auth')
  const resetUrl = 'https://app.example.test/api/auth/reset-password/synthetic-token'
  const send = configureAuth.mock.calls[0][0].emailAndPassword.sendResetPassword
  expect(passwordResetEnabled).toBe(true)
  await send!({ user: { id: 'test-user', email: 'recipient@example.test' }, url: resetUrl })
  expect(fetch).not.toHaveBeenCalled()
  await after.mock.calls[0][0]()

  const [endpoint, request] = fetch.mock.calls[0]
  expect(endpoint).toBe(url)
  expect(request?.method).toBe('POST')
  expect(request?.headers).toMatchObject({ Authorization: `Bearer ${key}` })
  expect(JSON.parse(request?.body as string)).toEqual({
    ...(from ? { from } : {}),
    to: ['recipient@example.test'],
    subject: 'Reset your MediTrack password',
    text: expect.stringContaining(resetUrl),
  })
})

it('suppresses delivery when the account cooldown is already claimed', async () => {
  vi.resetModules()
  vi.stubEnv('AGENTMAIL_API_KEY', 'agent-test')
  vi.stubEnv('MEDITRACK_AUTH_AGENTMAIL_INBOX', 'recovery@example.test')
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', fetch)
  query.mockResolvedValueOnce({ rowCount: 0 })
  await import('@/lib/auth')

  const send = configureAuth.mock.calls[0][0].emailAndPassword.sendResetPassword!
  await send({ user: { id: 'test-user', email: 'recipient@example.test' }, url: 'https://app.example.test/reset' })
  expect(query).not.toHaveBeenCalled()
  await after.mock.calls[0][0]()
  expect(fetch).not.toHaveBeenCalled()
})

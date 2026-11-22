import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({ after: (callback: () => Promise<void>) => callback() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('gates new accounts until they verify while allowing legacy accounts to sign in', async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3107')
  vi.stubEnv('AGENTMAIL_API_KEY', undefined)
  vi.stubEnv('RESEND_API_KEY', 'synthetic-api-key')
  vi.stubEnv('MEDITRACK_AUTH_EMAIL_FROM', 'sender@example.test')
  const mail = vi.fn<typeof fetch>().mockResolvedValue(new Response())
  vi.stubGlobal('fetch', mail)
  const { auth } = await import('@/lib/auth')
  const db = { user: [] as Record<string, unknown>[], account: [], session: [], verification: [] }
  const local = betterAuth({ ...auth.options, database: memoryAdapter(db), rateLimit: { enabled: false } })
  const body = { name: 'Test account', email: 'recipient@example.test', password: 'synthetic-password-123' }

  const signup = await local.api.signUpEmail({ body })
  expect(signup.token).toBeNull()
  expect(mail).toHaveBeenCalledOnce()
  await expect(local.api.signInEmail({ body })).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } })

  const payload = JSON.parse(String(mail.mock.calls[0][1]?.body))
  const verificationUrl = new URL(payload.text.match(/https?:\/\/\S+/)[0])
  await local.api.verifyEmail({ query: { token: verificationUrl.searchParams.get('token')! } })
  await expect(local.api.signInEmail({ body })).resolves.toMatchObject({ user: { emailVerified: true } })

  db.user[0].emailVerified = false
  db.user[0].requiresEmailVerification = false
  await expect(local.api.signInEmail({ body })).resolves.toMatchObject({ user: { emailVerified: false } })
})

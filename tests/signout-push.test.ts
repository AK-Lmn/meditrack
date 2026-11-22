import { afterEach, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import * as notifications from '@/app/actions/notifications'
import * as authClientModule from '@/lib/auth-client'

const { remove, where, signOut } = vi.hoisted(() => ({
  remove: vi.fn(), where: vi.fn(), signOut: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => ({ user: { id: 'test-user' } }) } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/db', () => ({ db: { delete: () => ({ where }) } }))
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ signOut }) }))
vi.mock('@/app/actions/notifications', async (original) => ({ ...(await original<typeof notifications>()), removePushSubscription: remove }))

const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('removes browser and stored push registration before revoking the session', async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true)
  remove.mockResolvedValue(undefined)
  signOut.mockImplementation(async () => {
    expect(remove).toHaveBeenCalledWith(endpoint)
    expect(unsubscribe).toHaveBeenCalledOnce()
    return { error: null }
  })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({
    pushManager: { getSubscription: async () => ({ endpoint, unsubscribe }) },
  }) } })
  const cleanup = Reflect.get(authClientModule, 'signOutCurrentDevice')
  expect(cleanup).toBeTypeOf('function')
  await cleanup()
  expect(signOut).toHaveBeenCalledOnce()
})

it('still revokes the session when the subscription lookup fails', async () => {
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => { throw new Error('Unavailable') } } })
  signOut.mockResolvedValue({ error: null })
  await authClientModule.signOutCurrentDevice()
  expect(signOut).toHaveBeenCalledOnce()
  expect(remove).not.toHaveBeenCalled()
})

it('scopes stored subscription removal to the authenticated account and endpoint', async () => {
  const actions = await vi.importActual<typeof notifications>('@/app/actions/notifications')
  const removeCurrent = Reflect.get(actions, 'removePushSubscription')
  expect(removeCurrent).toBeTypeOf('function')
  await removeCurrent(endpoint)
  const condition = where.mock.calls[0][0] as SQL
  const query = new PgDialect().sqlToQuery(condition)
  expect(query.sql).toContain('"push_subscriptions"."user_id"')
  expect(query.sql).toContain('"push_subscriptions"."endpoint"')
  expect(query.params).toEqual(['test-user', endpoint])
})

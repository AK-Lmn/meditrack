import { afterEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/cron/missed-doses/route'

const { reconcileMissedDoses } = vi.hoisted(() => ({ reconcileMissedDoses: vi.fn(async () => 2) }))
vi.mock('@/lib/reconcile-missed-doses', () => ({ reconcileMissedDoses }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

it.each([undefined, 'wrong-secret'])('rejects unauthenticated cron requests (%s)', async (authorization) => {
  vi.stubEnv('CRON_SECRET', 'test-secret')
  const response = await GET(new Request('http://localhost/api/cron/missed-doses', {
    headers: authorization ? { authorization: `Bearer ${authorization}` } : {},
  }))
  expect(response.status).toBe(401)
  expect(reconcileMissedDoses).not.toHaveBeenCalled()
})

it('runs the reconciliation when the cron secret matches', async () => {
  vi.stubEnv('CRON_SECRET', 'test-secret')
  const response = await GET(new Request('http://localhost/api/cron/missed-doses', {
    headers: { authorization: 'Bearer test-secret' },
  }))
  expect(await response.json()).toEqual({ recorded: 2 })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

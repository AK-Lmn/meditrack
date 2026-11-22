import { beforeEach, expect, it, vi } from 'vitest'
import { createMedication } from '@/app/actions/medications'

const { values } = vi.hoisted(() => ({ values: vi.fn() }))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => ({ user: { id: 'test-user' } }) } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { transaction: async (run: (tx: unknown) => unknown) => run({ insert: () => ({ values }) }) } }))

beforeEach(() => {
  values.mockReset()
  values.mockReturnValueOnce({ returning: async () => [{ id: 7 }] })
  values.mockReturnValueOnce({ returning: async () => [] })
})

it('persists all distinct times and labels a four-dose regimen', async () => {
  await createMedication({ name: 'Test medicine', dosage: '1 tablet', scheduleTimes: ['18:00', '08:00', '12:00', '22:00'] } as Parameters<typeof createMedication>[0])
  expect(values.mock.calls[0][0]).toMatchObject({ frequency: '4 times daily' })
  expect(values.mock.calls[1][0]).toEqual(['08:00', '12:00', '18:00', '22:00'].map((timeOfDay) => ({
    frequency: '4 times daily', medicationId: 7, userId: 'test-user', timeOfDay,
  })))
})

it('rejects duplicate times before writing medications', async () => {
  await expect(createMedication({ name: 'Test medicine', dosage: '1 tablet', scheduleTimes: ['08:00', '12:00', '12:00'] } as Parameters<typeof createMedication>[0])).rejects.toThrow('distinct due time')
  expect(values).not.toHaveBeenCalled()
})

it('continues to accept the older two-time input', async () => {
  await createMedication({ name: 'Test medicine', dosage: '1 tablet', frequency: 'Twice daily', timeOfDay: '09:00', secondTimeOfDay: '21:00' })
  expect(values.mock.calls[1][0].map((schedule: { timeOfDay: string }) => schedule.timeOfDay)).toEqual(['09:00', '21:00'])
})

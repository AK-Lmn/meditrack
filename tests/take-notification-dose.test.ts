import { expect, it, vi } from 'vitest'
import { takeNotificationDose } from '@/app/actions/notifications'

const { limit, updateValues, takeDose } = vi.hoisted(() => ({
  limit: vi.fn(),
  updateValues: vi.fn(() => ({ where: vi.fn() })),
  takeDose: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => ({ user: { id: 'test-user' } }) } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/app/actions/doses', () => ({ takeDose }))
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  update: () => ({ set: updateValues }),
} }))

it('removes a successfully completed dose reminder from the inbox', async () => {
  const scheduledFor = new Date('2026-11-22T00:00:00Z')
  limit.mockResolvedValueOnce([{ medicationId: 7, type: 'medication_due', occurrenceKey: '7:2026-11-22T08:00' }])
  limit.mockResolvedValueOnce([{ scheduledFor }])

  await takeNotificationDose(1)

  expect(takeDose).toHaveBeenCalledWith(7, scheduledFor)
  expect(updateValues).toHaveBeenCalledWith({ read: true, dismissed: true })
})

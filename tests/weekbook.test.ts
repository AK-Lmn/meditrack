import { expect, test } from 'vitest'
import { getWeekbookDays } from '../lib/weekbook'

test('groups recorded doses by local day across a month boundary', () => {
  const days = getWeekbookDays('2026-12-01', 'Asia/Manila', [
    { scheduledAt: '2026-11-29T17:00:00Z', status: 'taken' },
    { scheduledAt: '2026-11-30T03:00:00Z', status: 'missed' },
  ])
  expect(days.map((day) => day.date)).toEqual([
    '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
  ])
  expect(days[2]).toMatchObject({ taken: 1, recorded: 2 })
  expect(days[3]).toMatchObject({ taken: 0, recorded: 0 })
})

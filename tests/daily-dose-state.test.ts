import { describe, expect, it } from 'vitest'
import { calculateStreak } from '../lib/adherence'
import { getDailyDoseState } from '../lib/daily-dose-state'
import { occurrenceKey } from '../lib/medication-rules'
import { formatLocalDate, generateDailyOccurrences } from '../lib/scheduler'

describe('daily medication state', () => {
  const timezone = 'Asia/Singapore'
  const day = '2026-11-21'
  const schedule = generateDailyOccurrences(7, ['08:00', '20:00'], day, 1, timezone)
  const [morning, evening] = schedule

  it('ignores yesterday’s Taken log after local midnight', () => {
    const yesterday = new Date('2026-11-20T15:59:00Z')
    const today = formatLocalDate(new Date('2026-11-20T16:01:00Z'), timezone)
    const state = getDailyDoseState(schedule, [{ scheduledAt: yesterday, status: 'taken' }], today, timezone)
    expect(state).toMatchObject({ complete: false, takenCount: 0, target: morning.scheduledUtc })
  })

  it('targets the scheduled row for both marking and undo, including multiple doses', () => {
    const morningLog = { scheduledAt: morning.scheduledUtc, status: 'taken' }
    expect(getDailyDoseState(schedule, [morningLog], day, timezone)).toMatchObject({ complete: false, takenCount: 1, target: evening.scheduledUtc })
    const before = getDailyDoseState(schedule, [morningLog], day, timezone)
    const after = getDailyDoseState(schedule, [morningLog, { scheduledAt: evening.scheduledUtc, status: 'taken' }], day, timezone)
    expect(after).toMatchObject({ complete: true, takenCount: 2 })
    expect(occurrenceKey(7, after.target)).toBe(occurrenceKey(7, before.target))
  })

  it('uses a legacy once-daily log’s original timestamp when undoing it', () => {
    const legacy = new Date('2026-11-21T04:05:00Z')
    const state = getDailyDoseState([morning], [{ scheduledAt: legacy, status: 'taken' }], day, timezone)
    expect(state).toMatchObject({ complete: true, target: legacy })
  })

  it('does not extend a streak for a partial day and clears it as soon as today is missed', () => {
    const previous = { scheduledAt: '2026-11-20T08:00:00+08:00', status: 'taken' }
    const current = { scheduledAt: morning.scheduledUtc, status: 'taken' }
    const reference = new Date('2026-11-21T21:00:00+08:00')
    expect(calculateStreak([previous, current, { scheduledAt: evening.scheduledUtc, status: 'scheduled' }], reference, timezone).currentStreak).toBe(1)
    expect(calculateStreak([previous, { scheduledAt: morning.scheduledUtc, status: 'missed' }], reference, timezone).currentStreak).toBe(0)
  })
})

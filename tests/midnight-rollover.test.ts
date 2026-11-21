import { describe, expect, it } from 'vitest'
import { calculateStreak } from '../lib/adherence'
import { getDailyDoseState, summarizeDailyAdherence } from '../lib/daily-dose-state'
import { formatLocalDate, generateDailyOccurrences } from '../lib/scheduler'

// A once-daily 08:00 dose for a user in Asia/Manila (UTC+8), checked either side of local midnight.
const tz = 'Asia/Manila'
const dayOne = generateDailyOccurrences(7, ['08:00'], '2026-11-21', 1, tz)
const dayTwo = generateDailyOccurrences(7, ['08:00'], '2026-11-22', 1, tz)
const takenDayOne = { scheduledAt: dayOne[0].scheduledUtc, status: 'taken' }

function stateAt(iso: string, occurrences: typeof dayOne, logs: { scheduledAt: Date; status: string }[]) {
  const now = new Date(iso)
  const today = formatLocalDate(now, tz)
  return { today, state: getDailyDoseState(occurrences.filter((d) => d.localDate === today), logs, today, tz) }
}

describe('local midnight rollover (Asia/Manila)', () => {
  it('shows day one complete at 23:59 and a fresh pending dose at 00:01', () => {
    const before = stateAt('2026-11-21T15:59:00Z', [...dayOne, ...dayTwo], [takenDayOne]) // 23:59 Manila
    expect(before.today).toBe('2026-11-21')
    expect(before.state).toMatchObject({ complete: true, takenCount: 1, scheduledCount: 1 })

    const after = stateAt('2026-11-21T16:01:00Z', [...dayOne, ...dayTwo], [takenDayOne]) // 00:01 Manila
    expect(after.today).toBe('2026-11-22')
    expect(after.state).toMatchObject({ complete: false, takenCount: 0, scheduledCount: 1 })
    expect(summarizeDailyAdherence([after.state])).toEqual({ scheduled: 1, taken: 0, remaining: 1, percent: 0 })
  })

  it('keeps the streak at 1 just after midnight while the new dose is still pending', () => {
    const records = [takenDayOne, { scheduledAt: dayTwo[0].scheduledUtc, status: 'scheduled' }]
    expect(calculateStreak(records, new Date('2026-11-21T15:59:00Z'), tz).currentStreak).toBe(1)
    expect(calculateStreak(records, new Date('2026-11-21T16:01:00Z'), tz).currentStreak).toBe(1)
  })

  it('grows to 2 when day two is taken, and resets to 0 once day two is missed', () => {
    const takenDayTwo = { scheduledAt: dayTwo[0].scheduledUtc, status: 'taken' }
    expect(calculateStreak([takenDayOne, takenDayTwo], new Date('2026-11-22T04:00:00Z'), tz).currentStreak).toBe(2)

    const missedDayTwo = { scheduledAt: dayTwo[0].scheduledUtc, status: 'missed' }
    expect(calculateStreak([takenDayOne, missedDayTwo], new Date('2026-11-22T04:00:00Z'), tz).currentStreak).toBe(0)
  })

  it('does not carry yesterday as today for a UTC date that is still the previous day', () => {
    // 07:00 Manila on the 22nd is still 23:00 UTC on the 21st.
    expect(formatLocalDate(new Date('2026-11-21T23:00:00Z'), tz)).toBe('2026-11-22')
    expect(formatLocalDate(new Date('2026-11-21T23:00:00Z'), 'UTC')).toBe('2026-11-21')
  })
})

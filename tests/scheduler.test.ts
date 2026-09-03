import { describe, it, expect } from 'vitest'
import {
  generateDailyOccurrences,
  generateIntervalOccurrences,
  generateCycleOccurrences,
  computeNextOccurrence,
  localDatetimeToUtc,
  formatLocalDate,
  buildOccurrenceKey,
  canTransitionDoseState,
  transitionDoseState,
  isDuplicateOccurrence,
  addDaysToDateString,
  DoseRecord,
} from '../lib/scheduler'

describe('Scheduler Engine - Date & Timezone Math', () => {
  it('converts local datetime to UTC across standard time and offsets', () => {
    // UTC: 2026-08-20 08:00
    const utcDate = localDatetimeToUtc('2026-08-20', '08:00', 'UTC')
    expect(utcDate.toISOString()).toBe('2026-08-20T08:00:00.000Z')

    // Asia/Manila (UTC+8): 08:00 local should be 00:00 UTC
    const manilaDate = localDatetimeToUtc('2026-08-20', '08:00', 'Asia/Manila')
    expect(manilaDate.toISOString()).toBe('2026-08-20T00:00:00.000Z')

    // America/New_York (EDT, UTC-4 in August): 08:00 local should be 12:00 UTC
    const nyDate = localDatetimeToUtc('2026-08-20', '08:00', 'America/New_York')
    expect(nyDate.toISOString()).toBe('2026-08-20T12:00:00.000Z')
  })

  it('handles month-end roll-overs correctly (Jan 31 -> Feb 1 -> Feb 28)', () => {
    expect(addDaysToDateString('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysToDateString('2026-02-28', 1)).toBe('2026-03-01') // Non-leap year
    expect(addDaysToDateString('2024-02-28', 1)).toBe('2024-02-29') // Leap year
    expect(addDaysToDateString('2024-02-29', 1)).toBe('2024-03-01') // Leap year next day
  })

  it('handles year-end roll-over (Dec 31 -> Jan 1)', () => {
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDateString('2026-12-31', 5)).toBe('2027-01-05')
  })
})

describe('Scheduler Engine - Daily Specific Times Regimen', () => {
  it('generates multiple daily occurrences in chronological order', () => {
    const occurrences = generateDailyOccurrences(101, ['08:00', '20:00'], '2026-09-01', 2, 'UTC')
    expect(occurrences).toHaveLength(4)

    expect(occurrences[0]).toEqual({
      scheduledUtc: new Date('2026-09-01T08:00:00.000Z'),
      localDate: '2026-09-01',
      timeOfDay: '08:00',
      occurrenceKey: '101:2026-09-01T08:00',
    })
    expect(occurrences[1]).toEqual({
      scheduledUtc: new Date('2026-09-01T20:00:00.000Z'),
      localDate: '2026-09-01',
      timeOfDay: '20:00',
      occurrenceKey: '101:2026-09-01T20:00',
    })
    expect(occurrences[2].localDate).toBe('2026-09-02')
    expect(occurrences[3].localDate).toBe('2026-09-02')
  })
})

describe('Scheduler Engine - Recurring Intervals Regimen', () => {
  it('generates doses for every 6 hours crossing midnight cleanly', () => {
    // Starting at 18:00 on 2026-09-01 for 24 hours (4 doses: 18:00, 00:00 next day, 06:00, 12:00)
    const occurrences = generateIntervalOccurrences(102, 6, '2026-09-01', '18:00', 1, 'UTC')
    expect(occurrences).toHaveLength(4)

    expect(occurrences[0].timeOfDay).toBe('18:00')
    expect(occurrences[0].localDate).toBe('2026-09-01')

    // Day roll-over crossing midnight
    expect(occurrences[1].timeOfDay).toBe('00:00')
    expect(occurrences[1].localDate).toBe('2026-09-02')
    expect(occurrences[1].occurrenceKey).toBe('102:2026-09-02T00:00')

    expect(occurrences[2].timeOfDay).toBe('06:00')
    expect(occurrences[2].localDate).toBe('2026-09-02')

    expect(occurrences[3].timeOfDay).toBe('12:00')
    expect(occurrences[3].localDate).toBe('2026-09-02')
  })

  it('rejects non-positive interval hours', () => {
    expect(() => generateIntervalOccurrences(102, 0, '2026-09-01', '08:00', 1)).toThrow(
      'Interval hours must be greater than 0.'
    )
  })
})

describe('Scheduler Engine - Multi-day Cycle Regimen', () => {
  it('generates doses only during ON days of a cycle (e.g. 3 days on, 2 days off)', () => {
    const occurrences = generateCycleOccurrences(
      103,
      {
        onDays: 3,
        offDays: 2,
        cycleStartDate: '2026-09-01',
        times: ['09:00'],
      },
      '2026-09-01',
      6, // 6 days total: Days 0,1,2 (ON), 3,4 (OFF), 5 (ON)
      'UTC'
    )

    expect(occurrences).toHaveLength(4)
    expect(occurrences.map((o) => o.localDate)).toEqual([
      '2026-09-01', // ON (day 0)
      '2026-09-02', // ON (day 1)
      '2026-09-03', // ON (day 2)
      '2026-09-06', // ON (day 5, new cycle)
    ])
  })
})

describe('Scheduler Engine - Next Occurrence Calculation', () => {
  it('finds the earliest upcoming dose strictly after reference time', () => {
    const ref = new Date('2026-09-01T10:00:00.000Z')
    const next = computeNextOccurrence(
      104,
      {
        type: 'daily_times',
        times: ['08:00', '12:00', '18:00'],
      },
      ref,
      'UTC'
    )

    expect(next).not.toBeNull()
    expect(next?.timeOfDay).toBe('12:00')
    expect(next?.scheduledUtc.toISOString()).toBe('2026-09-01T12:00:00.000Z')
  })
})

describe('Scheduler Engine - State Progression & Deduplication', () => {
  it('allows valid transitions: scheduled -> taken -> scheduled (undo)', () => {
    const initial: DoseRecord = {
      medicationId: 201,
      scheduledAt: new Date('2026-09-01T08:00:00.000Z'),
      status: 'scheduled',
      occurrenceKey: '201:2026-09-01T08:00',
    }

    const taken = transitionDoseState(initial, 'taken')
    expect(taken.status).toBe('taken')
    expect(taken.takenAt).toBeInstanceOf(Date)

    const reverted = transitionDoseState(taken, 'scheduled')
    expect(reverted.status).toBe('scheduled')
    expect(reverted.takenAt).toBeNull()
  })

  it('allows valid transitions: scheduled -> missed and scheduled -> skipped', () => {
    const initial: DoseRecord = {
      medicationId: 201,
      scheduledAt: new Date('2026-09-01T08:00:00.000Z'),
      status: 'scheduled',
      occurrenceKey: '201:2026-09-01T08:00',
    }

    const missed = transitionDoseState(initial, 'missed')
    expect(missed.status).toBe('missed')

    const skipped = transitionDoseState(initial, 'skipped')
    expect(skipped.status).toBe('skipped')
  })

  it('prevents invalid direct transitions (e.g. taken -> missed without reverting)', () => {
    const taken: DoseRecord = {
      medicationId: 201,
      scheduledAt: new Date('2026-09-01T08:00:00.000Z'),
      status: 'taken',
      occurrenceKey: '201:2026-09-01T08:00',
      takenAt: new Date(),
    }

    expect(canTransitionDoseState('taken', 'missed')).toBe(false)
    expect(() => transitionDoseState(taken, 'missed')).toThrow()
  })

  it('detects and prevents duplicate occurrences for identical timestamps', () => {
    const existing = [
      { occurrenceKey: '201:2026-09-01T08:00' },
      { occurrenceKey: '201:2026-09-01T20:00' },
    ]

    expect(isDuplicateOccurrence(existing, '201:2026-09-01T08:00')).toBe(true)
    expect(isDuplicateOccurrence(existing, '201:2026-09-01T12:00')).toBe(false)
  })
})

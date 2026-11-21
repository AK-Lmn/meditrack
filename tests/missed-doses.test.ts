import { describe, expect, it } from 'vitest'
import { dosesScheduledFrom, missedDosesToRecord } from '../lib/missed-doses'

const tz = 'Asia/Manila'
// 2026-11-21 20:48 Manila
const now = new Date('2026-11-21T12:48:22Z')
const longAgo = new Date('2026-10-01T00:00:00Z')
const med = (over: Partial<{ id: number; updatedAt: Date; frequency: string; times: string[] }> = {}) => ({
  id: 7, updatedAt: longAgo, frequency: 'Once daily', times: ['08:00'], ...over,
})

describe('missedDosesToRecord', () => {
  it('backfills every past dose in the lookback window, not just the last two days', () => {
    const missed = missedDosesToRecord([med()], [], now, tz)
    // Nov 7 to Nov 21 inclusive: 15 daily 08:00 doses, all more than an hour past due.
    expect(missed).toHaveLength(15)
    expect(missed[0].scheduledAt.toISOString()).toBe('2026-11-07T00:00:00.000Z')
    expect(missed.at(-1)?.scheduledAt.toISOString()).toBe('2026-11-21T00:00:00.000Z')
    expect(missed.at(-1)?.occurrenceKey).toBe('7:2026-11-21')
  })

  it('does not record doses scheduled before the medication was added or last changed', () => {
    // Added at 20:30 Manila today, so the 08:00 dose never applied.
    const addedToday = med({ updatedAt: new Date('2026-11-21T12:30:00Z') })
    expect(missedDosesToRecord([addedToday], [], now, tz)).toEqual([])
    // Restored three days ago: only doses after the restore count.
    const restored = med({ updatedAt: new Date('2026-11-18T10:00:00Z') })
    expect(missedDosesToRecord([restored], [], now, tz).map((d) => d.scheduledAt.toISOString())).toEqual([
      '2026-11-19T00:00:00.000Z', '2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z',
    ])
  })

  it('leaves doses inside the 60-minute window as overdue, not missed', () => {
    const recent = med({ times: ['20:00'] }) // due 20:00 Manila, 48 minutes ago
    const missed = missedDosesToRecord([recent], [], now, tz)
    expect(missed.map((d) => d.scheduledAt.toISOString())).not.toContain('2026-11-21T12:00:00.000Z')
  })

  it('skips doses that already have a taken, skipped or missed record', () => {
    const logs = [
      { medicationId: 7, status: 'taken', scheduledAt: new Date('2026-11-21T00:00:00Z') },
      { medicationId: 7, status: 'skipped', scheduledAt: new Date('2026-11-20T00:00:00Z') },
      { medicationId: 7, status: 'missed', scheduledAt: new Date('2026-11-19T00:00:00Z') },
    ]
    const times = missedDosesToRecord([med()], logs, now, tz).map((d) => d.scheduledAt.toISOString())
    expect(times).not.toContain('2026-11-21T00:00:00.000Z')
    expect(times).not.toContain('2026-11-20T00:00:00.000Z')
    expect(times).not.toContain('2026-11-19T00:00:00.000Z')
    expect(times).toContain('2026-11-18T00:00:00.000Z')
  })

  it('treats a once-daily dose taken at another time that day as taken (older records used the tap time)', () => {
    const logs = [{ medicationId: 7, status: 'taken', scheduledAt: new Date('2026-11-21T03:30:00Z') }] // 11:30 Manila
    const times = missedDosesToRecord([med()], logs, now, tz).map((d) => d.scheduledAt.toISOString())
    expect(times).not.toContain('2026-11-21T00:00:00.000Z')
  })

  it('does not apply that shortcut to twice-daily medications', () => {
    const twice = med({ times: ['08:00', '20:00'], frequency: 'Twice daily' })
    const logs = [{ medicationId: 7, status: 'taken', scheduledAt: new Date('2026-11-21T00:00:00Z') }]
    const times = missedDosesToRecord([twice], logs, now, tz).map((d) => d.scheduledAt.toISOString())
    expect(times).not.toContain('2026-11-21T00:00:00.000Z')
    expect(times).toContain('2026-11-20T12:00:00.000Z') // yesterday's 20:00 still missed
  })

  it('ignores as-needed medications and medications without a schedule', () => {
    expect(missedDosesToRecord([med({ frequency: 'As needed' })], [], now, tz)).toEqual([])
    expect(missedDosesToRecord([med({ times: [] })], [], now, tz)).toEqual([])
  })
})

describe('dosesScheduledFrom', () => {
  const doses = [
    { scheduledUtc: new Date('2026-11-21T00:00:00Z') }, // 08:00 Manila
    { scheduledUtc: new Date('2026-11-21T12:00:00Z') }, // 20:00 Manila
  ]

  it('drops today doses that were due before the medication was added', () => {
    const addedAt = new Date('2026-11-21T06:30:00Z') // 14:30 Manila
    expect(dosesScheduledFrom(doses, addedAt)).toEqual([doses[1]])
  })

  it('keeps every dose for a medication added earlier, and a dose due at the exact moment it was added', () => {
    expect(dosesScheduledFrom(doses, new Date('2026-11-20T00:00:00Z'))).toEqual(doses)
    expect(dosesScheduledFrom(doses, new Date('2026-11-21T12:00:00Z'))).toEqual([doses[1]])
  })
})

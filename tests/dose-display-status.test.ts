import { describe, expect, it } from 'vitest'
import { getDoseDisplayStatus, MISSED_DOSE_WINDOW_MS } from '../lib/scheduler'

describe('dose timing states', () => {
  const due = new Date('2026-11-21T00:00:00Z')

  it.each([
    [-1, 'upcoming'],
    [0, 'upcoming'],
    [1, 'overdue'],
    [MISSED_DOSE_WINDOW_MS - 1, 'overdue'],
    [MISSED_DOSE_WINDOW_MS, 'missed'],
  ])('classifies a pending dose at offset %s ms as %s', (offset, expected) => {
    expect(getDoseDisplayStatus(due, new Date(due.getTime() + offset), 'scheduled')).toBe(expected)
  })

  it.each(['taken', 'skipped', 'missed'])('preserves an explicitly recorded %s state', (status) => {
    expect(getDoseDisplayStatus(due, new Date(due.getTime() + MISSED_DOSE_WINDOW_MS), status)).toBe(status)
  })
})

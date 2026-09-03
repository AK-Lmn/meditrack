import { describe, it, expect } from 'vitest'
import {
  calculateAdherenceScore,
  calculateStreak,
  AdherenceInputRecord,
} from '../lib/adherence'

describe('Adherence Engine - Scoring & Safe Division', () => {
  it('handles divide-by-zero on empty histories gracefully', () => {
    const emptyResult = calculateAdherenceScore([])
    expect(emptyResult.totalScheduled).toBe(0)
    expect(emptyResult.takenCount).toBe(0)
    expect(emptyResult.adherenceRate).toBe(0)
    expect(emptyResult.onTimeRate).toBe(0)
    expect(Number.isFinite(emptyResult.adherenceRate)).toBe(true)
    expect(isNaN(emptyResult.adherenceRate)).toBe(false)
  })

  it('calculates accurate adherence percentage and counts for taken, missed, and skipped', () => {
    const records: AdherenceInputRecord[] = [
      { scheduledAt: '2026-09-01T08:00:00Z', status: 'taken', takenAt: '2026-09-01T08:05:00Z' },
      { scheduledAt: '2026-09-01T20:00:00Z', status: 'taken', takenAt: '2026-09-01T20:10:00Z' },
      { scheduledAt: '2026-09-02T08:00:00Z', status: 'missed' },
      { scheduledAt: '2026-09-02T20:00:00Z', status: 'skipped' },
    ]

    const score = calculateAdherenceScore(records)
    expect(score.totalScheduled).toBe(4)
    expect(score.takenCount).toBe(2)
    expect(score.missedCount).toBe(1)
    expect(score.skippedCount).toBe(1)
    // 2 / 4 = 50%
    expect(score.adherenceRate).toBe(50)
  })

  it('differentiates on-time doses vs late doses based on allowable window', () => {
    const records: AdherenceInputRecord[] = [
      // 15 mins late (within 60m threshold) -> On time
      {
        scheduledAt: '2026-09-01T08:00:00Z',
        takenAt: '2026-09-01T08:15:00Z',
        status: 'taken',
      },
      // 3 hours late (> 60m threshold) -> Late
      {
        scheduledAt: '2026-09-01T12:00:00Z',
        takenAt: '2026-09-01T15:00:00Z',
        status: 'taken',
      },
    ]

    const score = calculateAdherenceScore(records, 60)
    expect(score.takenCount).toBe(2)
    expect(score.onTimeCount).toBe(1)
    expect(score.lateCount).toBe(1)
    expect(score.onTimeRate).toBe(50)
  })
})

describe('Adherence Engine - Streak Tracking', () => {
  it('returns zero streaks on empty history', () => {
    const result = calculateStreak([])
    expect(result.currentStreak).toBe(0)
    expect(result.longestStreak).toBe(0)
  })

  it('calculates consecutive daily streak correctly', () => {
    const records: AdherenceInputRecord[] = [
      // Day 1: 2026-09-01 (All taken)
      { scheduledAt: '2026-09-01T08:00:00Z', status: 'taken', takenAt: '2026-09-01T08:00:00Z' },
      // Day 2: 2026-09-02 (All taken)
      { scheduledAt: '2026-09-02T08:00:00Z', status: 'taken', takenAt: '2026-09-02T08:00:00Z' },
      // Day 3: 2026-09-03 (All taken)
      { scheduledAt: '2026-09-03T08:00:00Z', status: 'taken', takenAt: '2026-09-03T08:00:00Z' },
    ]

    const streak = calculateStreak(records, new Date('2026-09-03T12:00:00Z'), 'UTC')
    expect(streak.currentStreak).toBe(3)
    expect(streak.longestStreak).toBe(3)
  })

  it('breaks streak when a dose was missed', () => {
    const records: AdherenceInputRecord[] = [
      // Day 1 (taken)
      { scheduledAt: '2026-09-01T08:00:00Z', status: 'taken' },
      // Day 2 (missed - breaks streak)
      { scheduledAt: '2026-09-02T08:00:00Z', status: 'missed' },
      // Day 3 (taken)
      { scheduledAt: '2026-09-03T08:00:00Z', status: 'taken' },
    ]

    const streak = calculateStreak(records, new Date('2026-09-03T12:00:00Z'), 'UTC')
    expect(streak.currentStreak).toBe(1)
    expect(streak.longestStreak).toBe(1)
  })
})

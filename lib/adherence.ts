/**
 * Adherence scoring and streak calculation module for MediTrack.
 * Handles on-time vs. late vs. missed dose tracking, streaks,
 * and safeguards against divide-by-zero on empty histories.
 */

import { addDaysToDateString, formatLocalDate } from './scheduler'

export interface AdherenceInputRecord {
  scheduledAt: Date | string
  takenAt?: Date | string | null
  status: 'scheduled' | 'taken' | 'missed' | 'skipped' | string
}

export interface AdherenceScore {
  totalScheduled: number
  takenCount: number
  missedCount: number
  skippedCount: number
  onTimeCount: number
  lateCount: number
  /** Taken % of total scheduled (0-100). Safe against divide-by-zero. */
  adherenceRate: number
  /** Taken on-time % of total scheduled (0-100). */
  onTimeRate: number
}

export interface StreakMetrics {
  currentStreak: number
  longestStreak: number
}

/**
 * Calculate adherence scoring.
 * Gracefully returns 0% without NaN or Infinity when total records is 0.
 *
 * @param records Array of dose records
 * @param onTimeThresholdMinutes Allowable window around scheduled time to consider dose "on time" (default 60 mins)
 */
export function calculateAdherenceScore(
  records: AdherenceInputRecord[],
  onTimeThresholdMinutes = 60
): AdherenceScore {
  if (!records || records.length === 0) {
    return {
      totalScheduled: 0,
      takenCount: 0,
      missedCount: 0,
      skippedCount: 0,
      onTimeCount: 0,
      lateCount: 0,
      adherenceRate: 0,
      onTimeRate: 0,
    }
  }

  let takenCount = 0
  let missedCount = 0
  let skippedCount = 0
  let onTimeCount = 0
  let lateCount = 0

  const thresholdMs = onTimeThresholdMinutes * 60_000

  for (const record of records) {
    const status = record.status.toLowerCase()
    if (status === 'taken') {
      takenCount++
      if (record.takenAt && record.scheduledAt) {
        const scheduledTime = new Date(record.scheduledAt).getTime()
        const takenTime = new Date(record.takenAt).getTime()
        if (Number.isFinite(scheduledTime) && Number.isFinite(takenTime)) {
          const diffMs = Math.abs(takenTime - scheduledTime)
          if (diffMs <= thresholdMs) {
            onTimeCount++
          } else {
            lateCount++
          }
        } else {
          onTimeCount++
        }
      } else {
        onTimeCount++
      }
    } else if (status === 'missed') {
      missedCount++
    } else if (status === 'skipped') {
      skippedCount++
    }
  }

  const totalScheduled = records.length
  // Safeguard against divide-by-zero
  const adherenceRate = totalScheduled > 0 ? Math.round((takenCount / totalScheduled) * 100) : 0
  const onTimeRate = totalScheduled > 0 ? Math.round((onTimeCount / totalScheduled) * 100) : 0

  return {
    totalScheduled,
    takenCount,
    missedCount,
    skippedCount,
    onTimeCount,
    lateCount,
    adherenceRate,
    onTimeRate,
  }
}

/**
 * Calculate consecutive day streaks of adherence.
 * A day is counted as adherent if all doses for that day were taken and none were missed.
 */
export function calculateStreak(
  records: AdherenceInputRecord[],
  referenceDate = new Date(),
  timezone = 'UTC'
): StreakMetrics {
  if (!records || records.length === 0) {
    return { currentStreak: 0, longestStreak: 0 }
  }

  // Group records by local date
  const todayStr = formatLocalDate(referenceDate, timezone)
  const dayMap = new Map<string, { taken: number; missed: number; pending: number }>()

  for (const r of records) {
    const d = new Date(r.scheduledAt)
    if (!Number.isFinite(d.getTime())) continue
    const dateKey = formatLocalDate(d, timezone)
    if (dateKey > todayStr) continue
    const current = dayMap.get(dateKey) ?? { taken: 0, missed: 0, pending: 0 }
    if (r.status === 'taken') current.taken++
    if (r.status === 'missed') current.missed++
    if (r.status === 'scheduled') current.pending++
    dayMap.set(dateKey, current)
  }

  // Sort unique dates ascending
  const sortedDates = Array.from(dayMap.keys()).sort()
  if (sortedDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 }
  }

  let longestStreak = 0
  let currentRun = 0

  for (let i = 0; i < sortedDates.length; i++) {
    const dayStats = dayMap.get(sortedDates[i])!
    const isCompliant = dayStats.taken > 0 && dayStats.missed === 0 && dayStats.pending === 0

    if (isCompliant) {
      // Check if contiguous with previous day
      if (i > 0) {
        const prev = new Date(sortedDates[i - 1]).getTime()
        const curr = new Date(sortedDates[i]).getTime()
        const diffDays = Math.round((curr - prev) / 86_400_000)
        if (diffDays === 1) {
          currentRun++
        } else {
          currentRun = 1
        }
      } else {
        currentRun = 1
      }
      if (currentRun > longestStreak) longestStreak = currentRun
    } else {
      currentRun = 0
    }
  }

  // Calculate current streak from reference date
  const todayStats = dayMap.get(todayStr)
  const yesterdayStr = addDaysToDateString(todayStr, -1)

  let currentStreak = 0
  let checkDate = todayStats && (todayStats.missed > 0 || (todayStats.taken > 0 && todayStats.pending === 0)) ? todayStr : yesterdayStr

  while (dayMap.has(checkDate)) {
    const stats = dayMap.get(checkDate)!
    if (stats.taken > 0 && stats.missed === 0 && stats.pending === 0) {
      currentStreak++
      checkDate = addDaysToDateString(checkDate, -1)
    } else {
      break
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
  }
}

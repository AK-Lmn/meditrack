import { occurrenceKey } from './medication-rules'
import { addDaysToDateString, formatLocalDate, generateDailyOccurrences, getDoseDisplayStatus } from './scheduler'

export const MISSED_LOOKBACK_DAYS = 14

export type MissedDoseMedication = {
  id: number
  /** Doses scheduled before this instant are ignored: the medication was added, restored or changed after them. */
  updatedAt: Date
  frequency: string
  times: string[]
}

export type MissedDoseLog = { medicationId: number; status: string; scheduledAt: Date }

/**
 * Past doses of active medications that should be stored as missed: more than the missed
 * window overdue, not taken or skipped, and scheduled after the medication last changed.
 */
export function missedDosesToRecord(
  medications: MissedDoseMedication[],
  logs: MissedDoseLog[],
  now: Date,
  timezone: string,
  lookbackDays = MISSED_LOOKBACK_DAYS,
) {
  const today = formatLocalDate(now, timezone)
  const start = addDaysToDateString(today, -lookbackDays)

  return medications.flatMap(({ id, updatedAt, frequency, times }) => {
    if (!times.length || frequency.toLowerCase().includes('needed')) return []
    return generateDailyOccurrences(id, times, start, lookbackDays + 1, timezone)
      .filter((dose) => dose.scheduledUtc >= updatedAt && getDoseDisplayStatus(dose.scheduledUtc, now) === 'missed')
      .filter((dose) => !logs.some((log) => log.medicationId === id && (
        (log.status !== 'scheduled' && log.scheduledAt.getTime() === dose.scheduledUtc.getTime())
        // Earlier versions recorded once-daily doses at the tap time, so any taken log that day counts.
        || (times.length === 1 && log.status === 'taken' && formatLocalDate(log.scheduledAt, timezone) === dose.localDate)
      )))
      .map(({ scheduledUtc }) => ({ medicationId: id, scheduledAt: scheduledUtc, occurrenceKey: occurrenceKey(id, scheduledUtc) }))
  })
}

/** Doses due at or after `from`. A medication added mid-day has no earlier dose that day. */
export function dosesScheduledFrom<T extends { scheduledUtc: Date }>(doses: T[], from: Date): T[] {
  return doses.filter((dose) => dose.scheduledUtc >= from)
}

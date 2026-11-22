import { occurrenceKey } from './medication-rules'
import { addDaysToDateString, daysBetween, formatLocalDate, generateDailyOccurrences, getDoseDisplayStatus } from './scheduler'

export type MissedDoseMedication = {
  id: number
  /** Doses scheduled before this instant are ignored: the medication was added, restored or changed after them. */
  updatedAt: Date
  frequency: string
  times: string[]
  archive?: { at: Date; reminderTimes: Date[] }
}

export type MissedDoseLog = { medicationId: number; status: string; scheduledAt: Date }

/**
 * Use the current schedule for active medications and saved occurrences for archived ones.
 */
export function missedDosesToRecord(
  medications: MissedDoseMedication[],
  logs: MissedDoseLog[],
  now: Date,
  timezone: string,
  lookbackDays?: number,
) {
  const today = formatLocalDate(now, timezone)
  const lookbackStart = lookbackDays === undefined ? undefined : addDaysToDateString(today, -lookbackDays)
  return medications.flatMap(({ id, updatedAt, frequency, times, archive }) => {
    if (frequency.toLowerCase().includes('needed') || (!archive && !times.length)) return []
    const medicationLogs = logs.filter((log) => log.medicationId === id)
    const resolved = new Set(medicationLogs.filter(({ status }) => status !== 'scheduled').map(({ scheduledAt }) => scheduledAt.getTime()))
    // Older once-daily doses could be recorded at the time the user tapped Take.
    const takenDays = new Set(times.length === 1
      ? medicationLogs.filter(({ status }) => status === 'taken').map(({ scheduledAt }) => formatLocalDate(scheduledAt, timezone))
      : [])
    const scheduleStart = formatLocalDate(updatedAt, timezone)
    const start = lookbackStart && lookbackStart > scheduleStart ? lookbackStart : scheduleStart
    const candidates = archive
      ? [
          ...medicationLogs.filter(({ status }) => status === 'scheduled').map(({ scheduledAt }) => scheduledAt),
          ...archive.reminderTimes,
        ].filter((date) => date <= archive.at)
      : generateDailyOccurrences(id, times, start, daysBetween(start, today) + 1, timezone)
          .map(({ scheduledUtc }) => scheduledUtc)
          .filter((date) => date >= updatedAt)
    const missed = new Map<string, { medicationId: number; scheduledAt: Date; occurrenceKey: string }>()
    for (const scheduledAt of candidates) {
      if (getDoseDisplayStatus(scheduledAt, now) !== 'missed' || resolved.has(scheduledAt.getTime())) continue
      if (takenDays.size && takenDays.has(formatLocalDate(scheduledAt, timezone))) continue
      const key = occurrenceKey(id, scheduledAt)
      missed.set(key, { medicationId: id, scheduledAt, occurrenceKey: key })
    }
    return [...missed.values()].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  })
}

/** Doses due at or after `from`. A medication added mid-day has no earlier dose that day. */
export function dosesScheduledFrom<T extends { scheduledUtc: Date }>(doses: T[], from: Date): T[] {
  return doses.filter((dose) => dose.scheduledUtc >= from)
}

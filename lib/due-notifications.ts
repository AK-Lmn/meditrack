import { occurrenceKey } from './medication-rules'
import { buildOccurrenceKey, formatLocalDate, localDatetimeToUtc } from './scheduler'

export type DueDose = {
  medicationId: number
  scheduledAt: Date
  /** Key of the dose log row. Instant-based, same as the dashboard and dose actions. */
  occurrenceKey: string
  /** Key of the notification. Local date and time, same as the QStash reminders, so each dose has one notification. */
  notificationKey: string
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Doses whose due time has already passed on the user's current local day.
 * The local day and each due instant come from the user's timezone, and keys use the
 * same instant-based format as the dashboard and dose actions so one dose is one row.
 */
export function dueDosesToday(
  schedules: { medicationId: number; timeOfDay: string | null }[],
  now: Date,
  timezone: string,
): DueDose[] {
  let today: string
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
    today = formatLocalDate(now, timezone)
  } catch {
    return []
  }

  return schedules.flatMap(({ medicationId, timeOfDay }) => {
    const time = timeOfDay && TIME_OF_DAY.test(timeOfDay) ? timeOfDay : '08:00'
    const scheduledAt = localDatetimeToUtc(today, time, timezone)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt > now) return []
    return [{ medicationId, scheduledAt, occurrenceKey: occurrenceKey(medicationId, scheduledAt), notificationKey: buildOccurrenceKey(medicationId, today, time) }]
  })
}

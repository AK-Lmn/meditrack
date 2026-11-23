import { addDaysToDateString, formatLocalDate } from './scheduler'

export function getWeekbookDays<T extends { scheduledAt: Date | string; status: string }>(
  today: string,
  timezone: string,
  doses: T[],
) {
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDaysToDateString(today, index - 3),
    taken: 0,
    recorded: 0,
    entries: [] as T[],
  }))
  const byDate = new Map(days.map((day) => [day.date, day]))
  for (const dose of doses) {
    const day = byDate.get(formatLocalDate(new Date(dose.scheduledAt), timezone))
    if (!day) continue
    day.entries.push(dose)
    day.recorded++
    if (dose.status === 'taken') day.taken++
  }
  return days
}

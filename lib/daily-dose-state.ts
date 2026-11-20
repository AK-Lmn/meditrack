import { formatLocalDate, type ScheduledOccurrence } from './scheduler'

export function getDailyDoseState(
  occurrences: ScheduledOccurrence[],
  logs: { scheduledAt: Date | string; status: string }[],
  today: string,
  timezone: string,
) {
  const todaysTaken = logs.filter((log) => log.status === 'taken' && formatLocalDate(new Date(log.scheduledAt), timezone) === today)
  const times = new Set(todaysTaken.map((log) => new Date(log.scheduledAt).getTime()))
  const pending = occurrences.filter(({ scheduledUtc }) => !times.has(scheduledUtc.getTime()))

  // Earlier versions recorded once-daily doses using the action time.
  if (occurrences.length <= 1 && todaysTaken.length) {
    const scheduledTime = occurrences[0]?.scheduledUtc.getTime()
    const log = todaysTaken.find(({ scheduledAt }) => new Date(scheduledAt).getTime() === scheduledTime) ?? todaysTaken[0]
    return { takenCount: 1, complete: true, target: new Date(log.scheduledAt), pending: [] }
  }

  const takenCount = occurrences.length - pending.length
  const complete = occurrences.length > 0 && !pending.length
  return { takenCount, complete, target: (complete ? occurrences.at(-1) : pending[0])?.scheduledUtc, pending }
}

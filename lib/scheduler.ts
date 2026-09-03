/**
 * Deterministic scheduling engine and time calculations for MediTrack.
 * Handles recurring intervals, daily specific times, multi-day cycles,
 * timezone conversions, leap years, month-end roll-overs, and state transitions.
 */

export type DoseStatus = 'scheduled' | 'taken' | 'missed' | 'skipped'

export type RegimenType = 'daily_times' | 'interval' | 'cycle'

export interface DailyTimesRegimen {
  type: 'daily_times'
  times: string[] // e.g. ['08:00', '20:00']
}

export interface IntervalRegimen {
  type: 'interval'
  intervalHours: number // e.g. 6, 8, 12
  startTime: string // '08:00' anchor
}

export interface CycleRegimen {
  type: 'cycle'
  onDays: number // e.g. 21
  offDays: number // e.g. 7
  times: string[] // e.g. ['09:00']
  cycleStartDate: string // 'YYYY-MM-DD'
}

export type RegimenConfig = DailyTimesRegimen | IntervalRegimen | CycleRegimen

export interface ScheduledOccurrence {
  scheduledUtc: Date
  localDate: string // 'YYYY-MM-DD'
  timeOfDay: string // 'HH:MM'
  occurrenceKey: string
}

export interface DoseRecord {
  id?: number
  medicationId: number
  scheduledAt: Date
  takenAt?: Date | null
  status: DoseStatus
  occurrenceKey: string
}

export const ALLOWED_STATE_TRANSITIONS: Record<DoseStatus, DoseStatus[]> = {
  scheduled: ['taken', 'missed', 'skipped'],
  taken: ['scheduled'],
  missed: ['taken', 'scheduled'],
  skipped: ['scheduled', 'taken'],
}

export function canTransitionDoseState(from: DoseStatus, to: DoseStatus): boolean {
  if (from === to) return true
  return ALLOWED_STATE_TRANSITIONS[from]?.includes(to) ?? false
}

export function transitionDoseState(
  current: DoseRecord,
  nextStatus: DoseStatus,
  actionTimestamp = new Date()
): DoseRecord {
  if (!canTransitionDoseState(current.status, nextStatus)) {
    throw new Error(`Invalid state transition from '${current.status}' to '${nextStatus}'.`)
  }

  return {
    ...current,
    status: nextStatus,
    takenAt: nextStatus === 'taken' ? actionTimestamp : null,
  }
}

export function getZonedParts(date: Date, timezone = 'UTC'): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(date)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour') === 24 ? 0 : get('hour'),
      minute: get('minute'),
      second: get('second'),
    }
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    }
  }
}

export function formatLocalDate(date: Date, timezone = 'UTC'): string {
  const parts = getZonedParts(date, timezone)
  const y = parts.year
  const m = String(parts.month).padStart(2, '0')
  const d = String(parts.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function localDatetimeToUtc(localDate: string, timeOfDay: string, timezone = 'UTC'): Date {
  const [h, m] = (timeOfDay || '08:00').split(':').map((v) => parseInt(v, 10) || 0)
  const [year, month, day] = localDate.split('-').map((v) => parseInt(v, 10))

  let targetUtc = Date.UTC(year, month - 1, day, h, m, 0, 0)
  const desiredLocalUtc = Date.UTC(year, month - 1, day, h, m, 0, 0)

  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(targetUtc), timezone)
    const currentLocalUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
    const diff = desiredLocalUtc - currentLocalUtc
    if (diff === 0) break
    targetUtc += diff
  }

  return new Date(targetUtc)
}

export function buildOccurrenceKey(medicationId: number, localDate: string, timeOfDay: string): string {
  const cleanTime = timeOfDay.trim().slice(0, 5)
  return `${medicationId}:${localDate}T${cleanTime}`
}

export function isDuplicateOccurrence(
  existingRecords: Array<{ occurrenceKey?: string | null }>,
  candidateKey: string
): boolean {
  return existingRecords.some((r) => r.occurrenceKey === candidateKey)
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
  const resY = utc.getUTCFullYear()
  const resM = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const resD = String(utc.getUTCDate()).padStart(2, '0')
  return `${resY}-${resM}-${resD}`
}

export function daysBetween(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split('-').map(Number)
  const [y2, m2, d2] = toStr.split('-').map(Number)
  const t1 = Date.UTC(y1, m1 - 1, d1)
  const t2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((t2 - t1) / 86_400_000)
}

export function generateDailyOccurrences(
  medicationId: number,
  times: string[],
  startLocalDate: string,
  daysCount: number,
  timezone = 'UTC'
): ScheduledOccurrence[] {
  const occurrences: ScheduledOccurrence[] = []
  const sortedTimes = [...new Set(times)].sort()

  for (let d = 0; d < daysCount; d++) {
    const currentLocalDate = addDaysToDateString(startLocalDate, d)
    for (const time of sortedTimes) {
      const scheduledUtc = localDatetimeToUtc(currentLocalDate, time, timezone)
      occurrences.push({
        scheduledUtc,
        localDate: currentLocalDate,
        timeOfDay: time,
        occurrenceKey: buildOccurrenceKey(medicationId, currentLocalDate, time),
      })
    }
  }

  return occurrences
}

export function generateIntervalOccurrences(
  medicationId: number,
  intervalHours: number,
  startLocalDate: string,
  startTime: string,
  daysCount: number,
  timezone = 'UTC'
): ScheduledOccurrence[] {
  if (intervalHours <= 0) throw new Error('Interval hours must be greater than 0.')

  const occurrences: ScheduledOccurrence[] = []
  const firstUtc = localDatetimeToUtc(startLocalDate, startTime, timezone)
  const totalHours = daysCount * 24
  const stepMs = intervalHours * 3600_000
  const maxMs = firstUtc.getTime() + totalHours * 3600_000

  for (let currentMs = firstUtc.getTime(); currentMs < maxMs; currentMs += stepMs) {
    const currentDate = new Date(currentMs)
    const zoned = getZonedParts(currentDate, timezone)
    const localDate = `${zoned.year}-${String(zoned.month).padStart(2, '0')}-${String(zoned.day).padStart(2, '0')}`
    const timeOfDay = `${String(zoned.hour).padStart(2, '0')}:${String(zoned.minute).padStart(2, '0')}`

    occurrences.push({
      scheduledUtc: currentDate,
      localDate,
      timeOfDay,
      occurrenceKey: buildOccurrenceKey(medicationId, localDate, timeOfDay),
    })
  }

  return occurrences
}

export function generateCycleOccurrences(
  medicationId: number,
  cycle: { onDays: number; offDays: number; cycleStartDate: string; times: string[] },
  startLocalDate: string,
  daysCount: number,
  timezone = 'UTC'
): ScheduledOccurrence[] {
  const { onDays, offDays, cycleStartDate, times } = cycle
  const cycleLength = onDays + offDays
  if (cycleLength <= 0 || onDays <= 0) throw new Error('Cycle on-days must be at least 1.')

  const occurrences: ScheduledOccurrence[] = []
  const sortedTimes = [...new Set(times)].sort()

  for (let d = 0; d < daysCount; d++) {
    const currentLocalDate = addDaysToDateString(startLocalDate, d)
    const offsetFromCycleStart = daysBetween(cycleStartDate, currentLocalDate)
    if (offsetFromCycleStart < 0) continue

    const dayInCycle = offsetFromCycleStart % cycleLength
    const isOnDay = dayInCycle < onDays

    if (isOnDay) {
      for (const time of sortedTimes) {
        const scheduledUtc = localDatetimeToUtc(currentLocalDate, time, timezone)
        occurrences.push({
          scheduledUtc,
          localDate: currentLocalDate,
          timeOfDay: time,
          occurrenceKey: buildOccurrenceKey(medicationId, currentLocalDate, time),
        })
      }
    }
  }

  return occurrences
}

export function computeNextOccurrence(
  medicationId: number,
  regimen: RegimenConfig,
  referenceUtc: Date,
  timezone = 'UTC'
): ScheduledOccurrence | null {
  const refLocalDate = formatLocalDate(referenceUtc, timezone)

  let candidateOccurrences: ScheduledOccurrence[] = []

  if (regimen.type === 'daily_times') {
    candidateOccurrences = generateDailyOccurrences(medicationId, regimen.times, refLocalDate, 7, timezone)
  } else if (regimen.type === 'interval') {
    candidateOccurrences = generateIntervalOccurrences(
      medicationId,
      regimen.intervalHours,
      refLocalDate,
      regimen.startTime,
      7,
      timezone
    )
  } else if (regimen.type === 'cycle') {
    candidateOccurrences = generateCycleOccurrences(
      medicationId,
      {
        onDays: regimen.onDays,
        offDays: regimen.offDays,
        cycleStartDate: regimen.cycleStartDate,
        times: regimen.times,
      },
      refLocalDate,
      35,
      timezone
    )
  }

  const next = candidateOccurrences.find((occ) => occ.scheduledUtc.getTime() > referenceUtc.getTime())
  return next ?? null
}

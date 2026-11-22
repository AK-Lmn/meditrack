export type TimeOfDayGreeting = 'Good morning' | 'Good afternoon' | 'Good evening' | 'Good night'

export const supportedTimezones = ['UTC', ...Intl.supportedValuesOf('timeZone')]

export function requireTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) throw new Error('Invalid timezone.')
  try {
    // Keep supported aliases usable for accounts that already saved them.
    new Intl.DateTimeFormat('en', { timeZone: value })
    return value
  } catch {
    throw new Error('Invalid timezone.')
  }
}

export function getGreetingForHour(hour: number): TimeOfDayGreeting {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Good night'
}

/** Returns null when the supplied timezone is missing or is not a valid IANA timezone. */
export function getGreetingForTimeZone(timezone: string | null | undefined, now = new Date()): TimeOfDayGreeting | null {
  if (!timezone) return null

  try {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now).find((part) => part.type === 'hour')
    const hour = Number(hourPart?.value)
    return Number.isInteger(hour) ? getGreetingForHour(hour) : null
  } catch {
    return null
  }
}

export function formatDateForTimeZone(timezone: string | null | undefined, now = new Date()): string | null {
  if (!timezone) return null

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now)
  } catch {
    return null
  }
}

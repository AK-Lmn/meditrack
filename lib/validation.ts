/**
 * Validation and Data Boundary Resilience module for MediTrack.
 * Handles input sanitization, type guarding, and safe JSON recovery.
 */

export function cleanText(value: unknown, maxLength = 80): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

export function validateMedicationName(value: unknown): { valid: boolean; value: string; error?: string } {
  const name = cleanText(value, 80)
  if (!name || name.length < 2) {
    return { valid: false, value: name, error: 'Medication name must be at least 2 characters.' }
  }
  return { valid: true, value: name }
}

export function requireMedicationName(value: unknown): string {
  const result = validateMedicationName(value)
  if (!result.valid) throw new Error(result.error)
  return result.value
}

export function validateDosage(value: unknown): { valid: boolean; value: string; error?: string } {
  const dosage = cleanText(value, 40)
  if (!dosage) {
    return { valid: false, value: '', error: 'Dosage is required.' }
  }
  return { valid: true, value: dosage }
}

export function requireDosage(value: unknown): string {
  const result = validateDosage(value)
  if (!result.valid) throw new Error(result.error)
  return result.value
}

export function validateQuantity(value: unknown): { valid: boolean; value: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, value: 0, error: 'Quantity is required.' }
  }
  const num = Number(value)
  if (!Number.isFinite(num) || isNaN(num)) {
    return { valid: false, value: 0, error: 'Quantity must be a valid number.' }
  }
  if (num < 0) {
    return { valid: false, value: num, error: 'Quantity cannot be negative.' }
  }
  if (!Number.isInteger(num)) {
    return { valid: false, value: num, error: 'Quantity must be an integer.' }
  }
  return { valid: true, value: num }
}

export function requireQuantity(value: unknown): number {
  const result = validateQuantity(value)
  if (!result.valid) throw new Error(result.error)
  return result.value
}

export function validateTimeFormat(value: unknown): { valid: boolean; value: string; error?: string } {
  if (typeof value !== 'string') {
    return { valid: false, value: '', error: 'Time must be a string in HH:MM format.' }
  }
  const trimmed = value.trim()
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!timeRegex.test(trimmed)) {
    return { valid: false, value: trimmed, error: 'Time must be a valid 24-hour time in HH:MM format (00:00 to 23:59).' }
  }
  return { valid: true, value: trimmed }
}

export function validateIntervalHours(value: unknown): { valid: boolean; value: number; error?: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, value: 0, error: 'Interval is required.' }
  }
  const num = Number(value)
  if (!Number.isFinite(num) || isNaN(num) || num <= 0) {
    return { valid: false, value: 0, error: 'Interval must be a positive number greater than zero.' }
  }
  if (num > 168) {
    return { valid: false, value: num, error: 'Interval cannot exceed 168 hours (7 days).' }
  }
  return { valid: true, value: num }
}

export function validateCycle(onDays: unknown, offDays: unknown): {
  valid: boolean
  onDays: number
  offDays: number
  error?: string
} {
  const on = Number(onDays)
  const off = Number(offDays)
  if (!Number.isInteger(on) || on < 1) {
    return { valid: false, onDays: 0, offDays: 0, error: 'Cycle on-days must be at least 1.' }
  }
  if (!Number.isInteger(off) || off < 0) {
    return { valid: false, onDays: on, offDays: 0, error: 'Cycle off-days cannot be negative.' }
  }
  return { valid: true, onDays: on, offDays: off }
}

/**
 * Safely parse JSON or object payload with graceful fallback.
 * Guaranteed never to throw, recovering safely from corrupt or outdated states.
 */
export function safeParseJson<T>(raw: unknown, fallback: T, validator?: (val: unknown) => val is T): T {
  if (raw === null || raw === undefined) return fallback

  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return fallback
    }
  }

  if (validator) {
    try {
      return validator(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }

  if (typeof fallback === 'object' && fallback !== null) {
    if (typeof parsed !== 'object' || parsed === null) return fallback
  }

  return parsed as T
}

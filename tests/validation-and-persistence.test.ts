import { describe, it, expect } from 'vitest'
import {
  validateMedicationName,
  requireMedicationName,
  validateDosage,
  requireDosage,
  validateQuantity,
  requireQuantity,
  validateTimeFormat,
  validateIntervalHours,
  validateCycle,
  safeParseJson,
} from '../lib/validation'

describe('Data Boundary Resilience - Medication & Regimen Validation', () => {
  it('rejects empty or whitespace medication names', () => {
    expect(validateMedicationName('').valid).toBe(false)
    expect(validateMedicationName('   ').valid).toBe(false)
    expect(validateMedicationName('A').valid).toBe(false) // Too short (< 2 chars)
    expect(() => requireMedicationName('')).toThrow()
    expect(() => requireMedicationName('  ')).toThrow()
  })

  it('accepts valid medication names with trimming', () => {
    const res = validateMedicationName('  Metformin 500mg  ')
    expect(res.valid).toBe(true)
    expect(res.value).toBe('Metformin 500mg')
    expect(requireMedicationName('Lisinopril')).toBe('Lisinopril')
  })

  it('rejects missing dosage and accepts valid dosage', () => {
    expect(validateDosage('').valid).toBe(false)
    expect(validateDosage(null).valid).toBe(false)
    expect(() => requireDosage('')).toThrow()
    expect(requireDosage(' 20mg daily ')).toBe('20mg daily')
  })

  it('rejects negative or non-integer quantities', () => {
    expect(validateQuantity(-1).valid).toBe(false)
    expect(validateQuantity(-1).error).toContain('cannot be negative')
    expect(validateQuantity(3.5).valid).toBe(false)
    expect(validateQuantity('abc').valid).toBe(false)
    expect(validateQuantity(null).valid).toBe(false)

    expect(requireQuantity(10)).toBe(10)
    expect(requireQuantity('5')).toBe(5)
  })

  it('validates 24-hour time string format strictly', () => {
    expect(validateTimeFormat('08:00').valid).toBe(true)
    expect(validateTimeFormat('23:59').valid).toBe(true)
    expect(validateTimeFormat('00:00').valid).toBe(true)

    // Invalid hours / minutes / formats
    expect(validateTimeFormat('24:00').valid).toBe(false)
    expect(validateTimeFormat('12:60').valid).toBe(false)
    expect(validateTimeFormat('8:00').valid).toBe(false)
    expect(validateTimeFormat('invalid').valid).toBe(false)
    expect(validateTimeFormat('').valid).toBe(false)
  })

  it('validates recurring intervals (positive, max 168 hours)', () => {
    expect(validateIntervalHours(6).valid).toBe(true)
    expect(validateIntervalHours(0).valid).toBe(false)
    expect(validateIntervalHours(-4).valid).toBe(false)
    expect(validateIntervalHours(200).valid).toBe(false) // Exceeds 168h
  })

  it('validates multi-day cycle parameters', () => {
    expect(validateCycle(21, 7).valid).toBe(true)
    expect(validateCycle(0, 5).valid).toBe(false) // On days must be >= 1
    expect(validateCycle(5, -1).valid).toBe(false) // Off days cannot be negative
  })
})

describe('Data Boundary Resilience - Corrupted Payload Recovery', () => {
  const defaultMedicationState = {
    medications: [],
    doses: [],
    settings: { timezone: 'UTC' },
  }

  it('recovers gracefully from malformed or corrupted JSON without throwing', () => {
    const corruptPayload = '{ "medications": [invalid json'
    const recovered = safeParseJson(corruptPayload, defaultMedicationState)
    expect(recovered).toEqual(defaultMedicationState)
  })

  it('recovers gracefully from null, undefined, or empty string', () => {
    expect(safeParseJson(null, defaultMedicationState)).toEqual(defaultMedicationState)
    expect(safeParseJson(undefined, defaultMedicationState)).toEqual(defaultMedicationState)
    expect(safeParseJson('', defaultMedicationState)).toEqual(defaultMedicationState)
  })

  it('recovers when payload has incorrect type (e.g. primitive instead of object)', () => {
    expect(safeParseJson('12345', defaultMedicationState)).toEqual(defaultMedicationState)
    expect(safeParseJson('"a string"', defaultMedicationState)).toEqual(defaultMedicationState)
  })

  it('validates structure using schema validator function when provided', () => {
    interface UserConfig {
      theme: 'light' | 'dark'
      notifications: boolean
    }
    const defaultUserConfig: UserConfig = { theme: 'light', notifications: true }

    const isUserConfig = (val: unknown): val is UserConfig => {
      return (
        typeof val === 'object' &&
        val !== null &&
        ['light', 'dark'].includes((val as any).theme) &&
        typeof (val as any).notifications === 'boolean'
      )
    }

    // Outdated or corrupted payload
    const outdatedPayload = JSON.stringify({ theme: 'blue_neon', notifications: 'yes' })
    const safeResult = safeParseJson(outdatedPayload, defaultUserConfig, isUserConfig)
    expect(safeResult).toEqual(defaultUserConfig)

    // Valid payload
    const validPayload = JSON.stringify({ theme: 'dark', notifications: false })
    const validResult = safeParseJson(validPayload, defaultUserConfig, isUserConfig)
    expect(validResult).toEqual({ theme: 'dark', notifications: false })
  })
})

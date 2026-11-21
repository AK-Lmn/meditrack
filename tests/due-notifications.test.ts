import { describe, expect, it } from 'vitest'
import { dueDosesToday } from '../lib/due-notifications'

describe('dueDosesToday', () => {
  it('uses the user timezone for the local day and due time (Asia/Manila)', () => {
    // 2026-11-21 20:48 Manila = 12:48 UTC
    const now = new Date('2026-11-21T12:48:22Z')
    const due = dueDosesToday([{ medicationId: 7, timeOfDay: '08:00' }], now, 'Asia/Manila')
    expect(due).toHaveLength(1)
    // 08:00 Manila is 00:00 UTC, the same instant the dashboard and scheduler use.
    expect(due[0].scheduledAt.toISOString()).toBe('2026-11-21T00:00:00.000Z')
    expect(due[0].occurrenceKey).toBe('7:2026-11-21')
  })

  it('does not report a dose that is still in the future in the user timezone', () => {
    const now = new Date('2026-11-21T12:48:22Z')
    expect(dueDosesToday([{ medicationId: 7, timeOfDay: '20:53' }], now, 'Asia/Manila')).toEqual([])
  })

  it('keys an evening dose by its real instant, not by the UTC date plus local time', () => {
    const now = new Date('2026-11-21T12:48:22Z')
    const [dose] = dueDosesToday([{ medicationId: 7, timeOfDay: '20:00' }], now, 'Asia/Manila')
    expect(dose.scheduledAt.toISOString()).toBe('2026-11-21T12:00:00.000Z')
    expect(dose.occurrenceKey).toBe('7:2026-11-21T12:00')
  })

  it('follows the local date across the UTC midnight boundary', () => {
    // 2026-11-22 01:00 Manila = 2026-11-21 17:00 UTC, so the local day is already the 22nd.
    const now = new Date('2026-11-21T17:00:00Z')
    expect(dueDosesToday([{ medicationId: 7, timeOfDay: '08:00' }], now, 'Asia/Manila')).toEqual([])
    const later = new Date('2026-11-22T01:00:00Z')
    const [dose] = dueDosesToday([{ medicationId: 7, timeOfDay: '08:00' }], later, 'Asia/Manila')
    expect(dose.scheduledAt.toISOString()).toBe('2026-11-22T00:00:00.000Z')
  })

  it('works for timezones behind UTC (America/Los_Angeles)', () => {
    // 2026-11-21 19:00 PST = 2026-11-22 03:00 UTC
    const now = new Date('2026-11-22T03:00:00Z')
    const [dose] = dueDosesToday([{ medicationId: 3, timeOfDay: '08:00' }], now, 'America/Los_Angeles')
    expect(dose.scheduledAt.toISOString()).toBe('2026-11-21T16:00:00.000Z')
    expect(dose.occurrenceKey).toBe('3:2026-11-21T16:00')
  })

  it('treats a missing or invalid time of day as 08:00 and skips invalid timezones safely', () => {
    const now = new Date('2026-11-21T12:48:22Z')
    const [dose] = dueDosesToday([{ medicationId: 1, timeOfDay: '' }], now, 'Asia/Manila')
    expect(dose.scheduledAt.toISOString()).toBe('2026-11-21T00:00:00.000Z')
    expect(dueDosesToday([{ medicationId: 1, timeOfDay: '08:00' }], now, 'Not/AZone')).toEqual([])
  })
})

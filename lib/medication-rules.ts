import { cleanText, requireMedicationName, requireDosage, validateMedicationName, validateDosage } from './validation'
import { calculateAdherenceScore } from './adherence'
import { buildOccurrenceKey } from './scheduler'

export const medicationColors = ['sky', 'violet', 'amber', 'rose'] as const
export type MedicationColor = (typeof medicationColors)[number]

export { cleanText, requireMedicationName, requireDosage, validateMedicationName, validateDosage }

export function occurrenceKey(medicationId: number, date = new Date(), timeOfDay?: string): string {
  const d = date instanceof Date ? date : new Date(date)
  const iso = Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString()
  const dateStr = iso.slice(0, 10)
  if (timeOfDay) {
    return buildOccurrenceKey(medicationId, dateStr, timeOfDay)
  }
  const timeStr = iso.slice(11, 16)
  if (timeStr !== '00:00') {
    return `${medicationId}:${dateStr}T${timeStr}`
  }
  return `${medicationId}:${dateStr}`
}

export function percent(taken: number, total: number): number {
  return total > 0 ? Math.round((taken / total) * 100) : 0
}

export { calculateAdherenceScore }

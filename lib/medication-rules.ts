export const medicationColors = ['sky', 'violet', 'amber', 'rose'] as const
export type MedicationColor = (typeof medicationColors)[number]

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function requireMedicationName(value: unknown) {
  const name = cleanText(value, 80)
  if (name.length < 2) throw new Error('Medication name must be at least 2 characters.')
  return name
}

export function requireDosage(value: unknown) {
  const dosage = cleanText(value, 40)
  if (!dosage) throw new Error('Dosage is required.')
  return dosage
}

export function occurrenceKey(medicationId: number, date = new Date()) {
  return `${medicationId}:${date.toISOString().slice(0, 10)}`
}

export function percent(taken: number, total: number) {
  return total ? Math.round((taken / total) * 100) : 0
}

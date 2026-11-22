import { expect, it } from 'vitest'
import { verification } from '@/lib/db/schema'

it.each(['createdAt', 'updatedAt'] as const)('requires verification.%s', (column) => {
  expect(verification[column].notNull).toBe(true)
})

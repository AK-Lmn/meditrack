import { expect, it } from 'vitest'
import { auth } from '@/lib/auth'

it('uses shared database storage for auth rate limits', () => {
  expect(auth.options.rateLimit?.storage).toBe('database')
})

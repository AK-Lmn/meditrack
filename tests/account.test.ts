import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCurrentAccount } from '../app/actions/account'
import { validNewPassword } from '../lib/account-rules'

const { getSession, verifyPassword, transaction, headers } = vi.hoisted(() => ({
  getSession: vi.fn(), verifyPassword: vi.fn(), transaction: vi.fn(), headers: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession, verifyPassword } } }))
vi.mock('@/lib/db', () => ({ db: { transaction } }))
vi.mock('@/lib/reminder-scheduler', () => ({ cancelQueuedMessages: vi.fn() }))
vi.mock('next/headers', () => ({ headers }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))

describe('account deletion authorization', () => {
  beforeEach(() => vi.resetAllMocks())

  it('requires explicit confirmation before loading the session', async () => {
    await expect(deleteCurrentAccount('synthetic-password', 'delete')).rejects.toThrow('Confirm account deletion')
    expect(getSession).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects signed-out callers before verifying a password', async () => {
    getSession.mockResolvedValue(null)
    await expect(deleteCurrentAccount('synthetic-password', 'DELETE')).rejects.toThrow('Sign in')
    expect(verifyPassword).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('does not write anything if the current password is invalid', async () => {
    getSession.mockResolvedValue({ user: { id: 'synthetic-user' } })
    verifyPassword.mockRejectedValue(new Error('Invalid password'))
    await expect(deleteCurrentAccount('incorrect-password', 'DELETE')).rejects.toThrow('Invalid password')
    expect(transaction).not.toHaveBeenCalled()
  })
})

describe('password length rules', () => {
  it.each([[7, false], [8, true], [128, true], [129, false]])('accepts a %s-character password: %s', (length, expected) => {
    expect(validNewPassword('x'.repeat(length))).toBe(expected)
  })
})

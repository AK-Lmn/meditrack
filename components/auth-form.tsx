'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setLoading(true)
    const data = new FormData(event.currentTarget)
    const result = mode === 'sign-up'
      ? await authClient.signUp.email({ name: String(data.get('name')), email: String(data.get('email')), password: String(data.get('password')) })
      : await authClient.signIn.email({ email: String(data.get('email')), password: String(data.get('password')) })
    setLoading(false)
    if (result.error) { setError('We could not complete that request. Check your details and try again.'); return }
    router.push('/'); router.refresh()
  }
  return <form onSubmit={submit} className="space-y-4">
    {mode === 'sign-up' && <label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Name<input name="name" autoComplete="name" required className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" /></label>}
    <label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Email<input name="email" type="email" autoComplete="email" required className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" /></label>
    <label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Password<input name="password" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} minLength={8} required className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" /></label>
    {error && <p role="alert" aria-live="assertive" className="text-sm text-[#a84f5a] dark:text-[#f3b3bb]">{error}</p>}
    <button disabled={loading} aria-busy={loading} className="app-focus min-h-11 w-full rounded-lg bg-[#1e7b8c] py-3 text-sm font-bold text-white transition hover:bg-[#176b7a] disabled:opacity-60">{loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
  </form>
}

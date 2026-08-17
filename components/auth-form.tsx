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
    {mode === 'sign-up' && <label className="block text-sm font-semibold text-[#526277]">Name<input name="name" required className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] px-3 outline-none focus:border-[#63aeb5]" /></label>}
    <label className="block text-sm font-semibold text-[#526277]">Email<input name="email" type="email" required className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] px-3 outline-none focus:border-[#63aeb5]" /></label>
    <label className="block text-sm font-semibold text-[#526277]">Password<input name="password" type="password" minLength={8} required className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] px-3 outline-none focus:border-[#63aeb5]" /></label>
    {error && <p role="alert" className="text-sm text-[#bd6570]">{error}</p>}
    <button disabled={loading} className="w-full rounded-lg bg-[#1e7b8c] py-3 text-sm font-bold text-white transition hover:bg-[#176b7a] disabled:opacity-60">{loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
  </form>
}

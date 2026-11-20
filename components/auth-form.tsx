'use client'

import { FormEvent, useState } from 'react'
import { enterDashboard } from '@/app/actions/auth-navigation'
import { authClient } from '@/lib/auth-client'
import { passwordRules, validNewPassword } from '@/lib/account-rules'
import { PasswordField } from '@/components/password-field'
import Link from 'next/link'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    if (mode === 'sign-up' && !name) return setError('Enter your name.')
    if (!email || !(event.currentTarget.elements.namedItem('email') as HTMLInputElement).validity.valid) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    if (mode === 'sign-up' && !validNewPassword(password)) return setError(passwordRules)

    setLoading(true)
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setLoading(false)
        return setError('We could not complete that request. Check your details and try again.')
      }
    } catch {
      setLoading(false)
      return setError('Unable to reach MediTrack. Please try again.')
    }
    await enterDashboard()
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {mode === 'sign-up' && <label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Name<input name="name" autoComplete="name" required className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" /></label>}
    <label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Email<input name="email" type="email" autoComplete="email" required className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" /></label>
    <PasswordField label="Password" name="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} descriptionId={mode === 'sign-up' ? 'signup-password-rules' : undefined} />
    {mode === 'sign-up' ? <p id="signup-password-rules" className="text-xs">{passwordRules}</p> : <Link href="/forgot-password" className="app-focus inline-block rounded text-sm font-semibold text-[#1e7b8c] dark:text-[#84B3CE]">Forgot password?</Link>}
    {error && <p role="alert" aria-live="assertive" className="text-sm text-[#a84f5a] dark:text-[#f3b3bb]">{error}</p>}
    <button disabled={loading} aria-busy={loading} className="app-focus min-h-11 w-full rounded-lg bg-[#1e7b8c] py-3 text-sm font-bold text-white transition hover:bg-[#176b7a] disabled:opacity-60">{loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    {(process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL || process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL) && <div className="flex flex-wrap gap-4 text-xs">
      {process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL && <a className="app-focus underline" href={process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL}>Terms of service</a>}
      {process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL && <a className="app-focus underline" href={process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL}>Privacy policy</a>}
    </div>}
  </form>
}

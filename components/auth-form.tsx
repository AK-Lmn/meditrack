'use client'

import { FormEvent, useState } from 'react'
import { enterDashboard } from '@/app/actions/auth-navigation'
import { authClient } from '@/lib/auth-client'
import { passwordRules, validNewPassword } from '@/lib/account-rules'
import { PasswordField } from '@/components/password-field'
import { FieldErrorMessage, fieldErrorAttributes, useFieldErrors } from '@/components/field-errors'
import Link from 'next/link'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const fields = useFieldErrors()
  const nameError = fields.errorFor('name')
  const emailError = fields.errorFor('email')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setVerificationEmail('')
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    if (!fields.validate(form, {
      name: mode === 'sign-up' && !name ? 'Enter your name.' : undefined,
      email: !email || !(form.elements.namedItem('email') as HTMLInputElement).validity.valid ? 'Enter a valid email address.' : undefined,
      password: !password ? 'Enter your password.' : mode === 'sign-up' && !validNewPassword(password) ? passwordRules : undefined,
    })) return

    setLoading(true)
    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name, email, password, callbackURL: '/sign-in' })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setLoading(false)
        if (mode === 'sign-in' && result.error.code === 'EMAIL_NOT_VERIFIED') {
          setVerificationEmail(email)
          return setError('Verify your email before signing in.')
        }
        return setError('We could not complete that request. Check your details and try again.')
      }
    } catch {
      setLoading(false)
      return setError('Unable to reach MediTrack. Please try again.')
    }
    if (mode === 'sign-up') {
      setLoading(false)
      setNotice('Check your email for a verification link, then sign in.')
      return
    }
    await enterDashboard()
  }

  async function resendVerification() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await authClient.sendVerificationEmail({ email: verificationEmail, callbackURL: '/sign-in' })
      if (result.error) throw new Error(result.error.message)
      setVerificationEmail('')
      setNotice('Check your email for a new verification link.')
    } catch {
      setError('Could not resend the verification email. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }
  return <form noValidate onSubmit={submit} className="space-y-4">
    {mode === 'sign-up' && <div><label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Name<input name="name" autoComplete="name" required {...fieldErrorAttributes(nameError)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#c4d7cf] bg-white px-3 outline-none dark:border-[#48675a] dark:bg-[#284739] dark:text-[#ecf8f2]" /></label><FieldErrorMessage error={nameError} /></div>}
    <div><label className="block text-sm font-semibold text-[#526277] dark:text-[#d4e2e8]">Email<input name="email" type="email" autoComplete="email" required {...fieldErrorAttributes(emailError)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#c4d7cf] bg-white px-3 outline-none dark:border-[#48675a] dark:bg-[#284739] dark:text-[#ecf8f2]" /></label><FieldErrorMessage error={emailError} /></div>
    <PasswordField label="Password" name="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} descriptionId={mode === 'sign-up' ? 'signup-password-rules' : undefined} error={fields.errorFor('password')} />
    {mode === 'sign-up' ? <p id="signup-password-rules" className="text-xs">{passwordRules}</p> : <Link href="/forgot-password" className="app-focus inline-block rounded text-sm font-semibold text-[#155b48] dark:text-[#9de6ca]">Forgot password?</Link>}
    {error && <p role="alert" aria-live="assertive" className="text-sm text-[#a84f5a] dark:text-[#f3b3bb]">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {verificationEmail && <button type="button" disabled={loading} onClick={resendVerification} className="app-focus rounded text-sm font-semibold text-[#155b48] dark:text-[#9de6ca]">Resend verification email</button>}
    <button disabled={loading} aria-busy={loading} className="app-focus min-h-11 w-full rounded-lg bg-[#155b48] py-3 text-sm font-bold text-white transition hover:bg-[#104b3b] disabled:opacity-60">{loading ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    {(process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL || process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL) && <div className="flex flex-wrap gap-4 text-xs">
      {process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL && <a className="app-focus underline" href={process.env.NEXT_PUBLIC_MEDITRACK_TERMS_URL}>Terms of service</a>}
      {process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL && <a className="app-focus underline" href={process.env.NEXT_PUBLIC_MEDITRACK_PRIVACY_URL}>Privacy policy</a>}
    </div>}
  </form>
}

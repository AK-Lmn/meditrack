'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { PasswordField, authInput } from '@/components/password-field'
import { FieldErrorMessage, fieldErrorAttributes, useFieldErrors } from '@/components/field-errors'
import { passwordRules, validNewPassword } from '@/lib/account-rules'
import { authClient } from '@/lib/auth-client'

export function PasswordRecovery(props: { mode: 'request'; enabled: boolean } | { mode: 'reset'; token?: string }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const fields = useFieldErrors()
  const emailError = fields.errorFor('email')
  const requesting = props.mode === 'request'
  const available = props.mode === 'request' ? props.enabled : Boolean(props.token)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim()
    const newPassword = String(data.get('password') ?? '')
    if (props.mode === 'request') {
      const emailField = form.elements.namedItem('email') as HTMLInputElement
      if (!fields.validate(form, { email: !email || !emailField.validity.valid ? 'Enter a valid email address.' : undefined })) return
    } else if (!fields.validate(form, {
      password: !validNewPassword(newPassword) ? passwordRules : undefined,
      confirmPassword: newPassword !== data.get('confirmPassword') ? 'The new passwords do not match.' : undefined,
    })) return

    setPending(true)
    try {
      const result = props.mode === 'request'
        ? await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })
        : await authClient.resetPassword({ newPassword, token: props.token })
      if (result.error) throw new Error()
      form.reset()
      setMessage(requesting ? 'If an account exists for that email, a reset link will be sent.' : 'Password reset. You can sign in with your new password.')
    } catch {
      setError(requesting ? 'Could not request a reset link. Try again later.' : 'Could not reset your password. Request a new reset link and try again.')
    } finally {
      setPending(false)
    }
  }

  return <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-5 dark:bg-[#0d2230]">
    <section className="w-full max-w-md space-y-4 rounded-2xl border border-[#e5eaf1] bg-white p-6 dark:border-[#254258] dark:bg-[#132b3b]">
      <h1 className="text-2xl font-bold">{requesting ? 'Forgot password' : 'Set a new password'}</h1>
      {!available && <p role="status" className="text-sm">{requesting ? 'Password recovery by email is currently unavailable.' : 'This reset link is invalid or expired.'}</p>}
      {available && !message && <form noValidate onSubmit={submit} className="space-y-4">
        {requesting ? <div><label className="grid gap-2 text-sm font-semibold">Email<input name="email" type="email" autoComplete="email" required {...fieldErrorAttributes(emailError)} className={authInput} /></label><FieldErrorMessage error={emailError} /></div> : <>
          <PasswordField label="New password" name="password" autoComplete="new-password" descriptionId="reset-password-rules" error={fields.errorFor('password')} />
          <p id="reset-password-rules" className="text-xs">{passwordRules}</p>
          <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" error={fields.errorFor('confirmPassword')} />
        </>}
        {error && <p role="alert" className="text-sm">{error}</p>}
        <button disabled={pending} className="app-focus min-h-11 w-full rounded-lg bg-[#1e7b8c] px-4 text-sm font-bold text-white disabled:opacity-60">{requesting ? 'Send reset link' : 'Reset password'}</button>
      </form>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <Link href="/sign-in" className="app-focus inline-block rounded text-sm font-semibold underline">Back to sign in</Link>
      {!requesting && !message && <Link href="/forgot-password" className="app-focus ml-4 inline-block rounded text-sm font-semibold underline">Request a new link</Link>}
    </section>
  </main>
}

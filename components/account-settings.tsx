'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { deleteCurrentAccount } from '@/app/actions/account'
import { PasswordField, authInput } from '@/components/password-field'
import { passwordRules, validNewPassword } from '@/lib/account-rules'
import { authClient, signOutCurrentDevice } from '@/lib/auth-client'

const panel = 'rounded-2xl border border-[#e5eaf1] bg-white p-5 dark:border-[#254258] dark:bg-[#132b3b]'
const save = 'app-focus min-h-11 rounded-lg bg-[#1e7b8c] px-4 text-sm font-bold text-white disabled:opacity-60'
type Feedback = { text: string; error?: boolean }

function FormFeedback({ feedback }: { feedback: Feedback | null }) {
  return feedback && <p role={feedback.error ? 'alert' : 'status'} className="text-sm">{feedback.text}</p>
}

export function AccountSettings({ user }: { user: { name: string; email: string } }) {
  const router = useRouter()
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name || name.length > 80) return setProfileFeedback({ text: 'Enter a name between 1 and 80 characters.', error: true })
    setProfileFeedback(null)
    setSavingProfile(true)
    try {
      const result = await authClient.updateUser({ name })
      if (result.error) throw new Error()
      setProfileFeedback({ text: 'Profile updated.' })
      router.refresh()
    } catch {
      setProfileFeedback({ text: 'Could not update your profile. Try again.', error: true })
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const currentPassword = String(data.get('currentPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    if (!currentPassword) return setPasswordFeedback({ text: 'Enter your current password.', error: true })
    if (!validNewPassword(newPassword)) return setPasswordFeedback({ text: passwordRules, error: true })
    if (newPassword === currentPassword) return setPasswordFeedback({ text: 'Choose a different password.', error: true })
    if (newPassword !== data.get('confirmPassword')) return setPasswordFeedback({ text: 'The new passwords do not match.', error: true })

    setPasswordFeedback(null)
    setSavingPassword(true)
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      if (result.error) return setPasswordFeedback({ text: 'Could not change your password. Check your current password and try again.', error: true })
      form.reset()
      setPasswordFeedback({ text: 'Password changed. Other sessions were signed out.' })
    } catch {
      setPasswordFeedback({ text: 'Could not change your password. Try again.', error: true })
    } finally {
      setSavingPassword(false)
    }
  }

  return <>
    <section className={panel}>
      <h2 className="text-base font-bold">Profile</h2>
      <p className="mt-1 break-all text-sm">{user.email}</p>
      <form className="mt-4 max-w-md space-y-3" noValidate onSubmit={saveProfile}>
        <label className="grid gap-2 text-sm font-semibold">Display name<input name="name" defaultValue={user.name} autoComplete="name" required className={authInput} /></label>
        <FormFeedback feedback={profileFeedback} />
        <button className={save} disabled={savingProfile}>Save profile</button>
      </form>
    </section>
    <section className={panel}>
      <h2 className="text-base font-bold">Change password</h2>
      <form className="mt-4 max-w-md space-y-3" noValidate onSubmit={changePassword}>
        <PasswordField label="Current password" name="currentPassword" autoComplete="current-password" />
        <PasswordField label="New password" name="newPassword" autoComplete="new-password" descriptionId="change-password-rules" />
        <p id="change-password-rules" className="text-xs">{passwordRules}</p>
        <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" />
        <FormFeedback feedback={passwordFeedback} />
        <button className={save} disabled={savingPassword}>Change password</button>
      </form>
    </section>
    <DeleteAccount />
  </>
}

function DeleteAccount() {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    if (confirmation !== 'DELETE' || !password) return setFeedback({ text: 'Enter your current password and type DELETE.', error: true })
    setFeedback(null)
    setPending(true)
    try {
      await deleteCurrentAccount(password, confirmation)
    } catch {
      setFeedback({ text: 'Could not delete the account. Check your password and try again.', error: true })
      setPending(false)
      return
    }
    try { await signOutCurrentDevice() } finally { window.location.replace('/sign-in') }
  }

  return <section className={panel}>
    <h2 className="text-base font-bold">Delete account</h2>
    <Dialog.Root onOpenChange={() => { if (!pending) setFeedback(null) }}>
      <Dialog.Trigger className="app-focus mt-3 min-h-11 rounded-lg border border-red-300 px-4 text-sm font-bold text-red-700 dark:text-red-200">Delete account</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-[#18243a]/45 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-[61] flex items-center justify-center p-4">
          <Dialog.Popup className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl outline-none dark:bg-[#132b3b]">
            <Dialog.Title className="text-lg font-bold">Permanently delete your account?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm">This removes your profile, medications, dose history, and reminders, and signs out all sessions.</Dialog.Description>
            <form noValidate onSubmit={submit} className="mt-4 space-y-3">
              <PasswordField label="Current password" name="password" autoComplete="current-password" />
              <label className="grid gap-2 text-sm font-semibold">Type DELETE to confirm<input name="confirmation" autoComplete="off" required className={authInput} /></label>
              <FormFeedback feedback={feedback} />
              <div className="flex flex-wrap justify-end gap-2">
                <Dialog.Close disabled={pending} className="app-focus min-h-11 rounded-lg border px-4 text-sm font-semibold">Cancel</Dialog.Close>
                <button disabled={pending} className="app-focus min-h-11 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Deleting…' : 'Permanently delete account'}</button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  </section>
}

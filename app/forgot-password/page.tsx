import { PasswordRecovery } from '@/components/password-recovery'
import { passwordResetEnabled } from '@/lib/auth'

export const metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return <PasswordRecovery mode="request" enabled={passwordResetEnabled} />
}

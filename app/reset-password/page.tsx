import { PasswordRecovery } from '@/components/password-recovery'

export const metadata = { title: "Reset password" }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams
  return <PasswordRecovery mode="reset" token={typeof token === 'string' ? token : undefined} />
}

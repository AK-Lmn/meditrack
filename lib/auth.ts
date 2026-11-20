import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/account-rules'
import { after } from 'next/server'

const resetApiKey = process.env.RESEND_API_KEY
const resetEmailFrom = process.env.MEDITRACK_AUTH_EMAIL_FROM
export const passwordResetEnabled = Boolean(resetApiKey && resetEmailFrom)

export const auth = betterAuth({
  database: pool,

  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
    ...(passwordResetEnabled ? {
      sendResetPassword: async ({ user, url }) => {
        after(async () => {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resetApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: resetEmailFrom, to: [user.email], subject: 'Reset your MediTrack password', text: `Reset your MediTrack password: ${url}\n\nIf you did not request this, you can ignore this email.` }),
          })
          if (!response.ok) throw new Error(`Password reset email delivery failed (${response.status}).`)
        })
      },
    } : {}),
  },

  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    'https://meds-track.vercel.app',
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.V0_RUNTIME_URL,
  ].filter((origin): origin is string => Boolean(origin)),

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },

  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})

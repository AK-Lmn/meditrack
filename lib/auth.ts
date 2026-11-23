import { betterAuth } from 'better-auth'
import { createHash } from 'node:crypto'
import { APIError } from 'better-auth/api'
import { pool } from '@/lib/db'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/account-rules'
import { after } from 'next/server'

const agentMailKey = process.env.AGENTMAIL_API_KEY
const agentMailInbox = process.env.MEDITRACK_AUTH_AGENTMAIL_INBOX
const resendKey = process.env.RESEND_API_KEY
const resendFrom = process.env.MEDITRACK_AUTH_EMAIL_FROM
const resetSender = agentMailKey && agentMailInbox
  ? {
      url: `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(agentMailInbox)}/messages/send`,
      key: agentMailKey,
      from: undefined,
    }
  : resendKey && resendFrom
    ? { url: 'https://api.resend.com/emails', key: resendKey, from: resendFrom }
    : null

export const passwordResetEnabled = Boolean(resetSender)

async function claimPasswordResetEmail(userId: string) {
  const key = `reset-email:${createHash('sha256').update(userId).digest('hex')}`
  const { rowCount } = await pool.query(
    `INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest")
     VALUES ($1, $1, 1, floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
     ON CONFLICT ("key") DO UPDATE SET "lastRequest" = EXCLUDED."lastRequest"
     WHERE "rateLimit"."lastRequest" <= EXCLUDED."lastRequest" - 60000
     RETURNING "id"`,
    [key],
  )
  return rowCount === 1
}

function sendAuthEmail(to: string, subject: string, text: string, shouldSend?: () => Promise<boolean>) {
  const sender = resetSender
  if (!sender) throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' })
  after(async () => {
    if (shouldSend && !await shouldSend()) return
    const response = await fetch(sender.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sender.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: sender.from, to: [to], subject, text }),
    })
    if (!response.ok) throw new Error(`Auth email delivery failed (${response.status}).`)
  })
}

export const auth = betterAuth({
  database: pool,
  rateLimit: {
    storage: 'database',
  },

  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),

  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
    ...(resetSender ? {
      sendResetPassword: async ({ user, url }) => {
        sendAuthEmail(
          user.email,
          'Reset your MediTrack password',
          `Reset your MediTrack password: ${url}\n\nIf you did not request this, you can ignore this email.`,
          () => claimPasswordResetEmail(user.id),
        )
      },
    } : {}),
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendAuthEmail(user.email, 'Verify your MediTrack email', `Verify your MediTrack email: ${url}\n\nIf you did not create an account, you can ignore this email.`)
    },
  },
  user: {
    additionalFields: {
      requiresEmailVerification: { type: 'boolean', defaultValue: true, input: false, returned: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async () => {
          if (!resetSender) throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' })
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          const user = await context?.context.internalAdapter.findUserById(session.userId)
          if (!user) return false
          const isLegacyAccount = 'requiresEmailVerification' in user && user.requiresEmailVerification === false
          if (!isLegacyAccount && !user.emailVerified) {
            throw new APIError('FORBIDDEN', { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before signing in.' })
          }
        },
      },
    },
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

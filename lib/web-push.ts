/**
 * Server-only Web Push delivery utility.
 * Import only in API routes or server-side code.
 * NEVER import this in client components.
 *
 * VAPID private key is server-only.
 * VAPID public key is shared with the client via NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */
import webpush from 'web-push'
import type { PushSubscription as WebPushSubscription } from 'web-push'

if (typeof window !== 'undefined') {
  throw new Error('lib/web-push.ts must only be imported on the server side.')
}

let _configured = false

function ensureConfigured() {
  if (_configured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.',
    )
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  _configured = true
}

/** Returns true when VAPID env vars are present (does not validate their format). */
export function isVapidConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export type PushPayload = {
  title: string
  body: string
  tag?: string
  url?: string
}

export type PushResult =
  | { ok: true }
  | { ok: false; expired: boolean; error: string }

/**
 * Send a Web Push notification to a single subscription.
 * Returns { ok: false, expired: true } if the subscription is stale/expired
 * (HTTP 404 or 410 from the push service) — callers should remove it from DB.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<PushResult> {
  ensureConfigured()

  const pushSub: WebPushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload))
    return { ok: true }
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : undefined
    const expired = statusCode === 404 || statusCode === 410
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : 'Unknown push error'
    return { ok: false, expired, error: message }
  }
}

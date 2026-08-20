/**
 * Server-only QStash client.
 * Import only in server actions, API routes, or server components.
 * NEVER import this in client components or NEXT_PUBLIC_ files.
 *
 * Regional endpoint:
 *   The @upstash/qstash SDK automatically reads QSTASH_URL from the
 *   environment to select the correct regional endpoint. We also pass
 *   it explicitly as `baseUrl` so the intent is unambiguous and
 *   resilient to future SDK changes.
 *
 *   Required env vars:
 *     QSTASH_URL                  – Regional base URL, e.g.
 *                                   https://qstash-us-east-1.upstash.io
 *     QSTASH_TOKEN                – Bearer token for publishing messages
 *     QSTASH_CURRENT_SIGNING_KEY  – For verifying inbound QStash requests
 *     QSTASH_NEXT_SIGNING_KEY     – Rotation key for signature verification
 */
import { Client } from '@upstash/qstash'

if (typeof window !== 'undefined') {
  throw new Error('lib/qstash.ts must only be imported on the server side.')
}

// Warn loudly at startup (server only) if the regional URL is missing.
// This surfaces misconfiguration in logs before any publish attempt fails.
if (!process.env.QSTASH_URL) {
  console.warn(
    '[QStash] QSTASH_URL is not set. The SDK will fall back to the default ' +
    'endpoint which may not match your Upstash region and will cause ' +
    '"user not found in this region" errors. Set QSTASH_URL to the correct ' +
    'regional base URL (e.g. https://qstash-us-east-1.upstash.io).',
  )
}

// Lazily instantiated so that missing env var doesn't crash at import time
// in environments where QStash isn't configured yet (e.g. test builds).
let _client: Client | null = null

export function getQStashClient(): Client {
  if (!_client) {
    const token = process.env.QSTASH_TOKEN
    if (!token) throw new Error('QSTASH_TOKEN environment variable is not set.')

    // Pass baseUrl explicitly so the regional endpoint is unambiguous.
    // The SDK also reads QSTASH_URL automatically, but being explicit here
    // makes the configuration visible and avoids silent regressions.
    const baseUrl = process.env.QSTASH_URL
    _client = new Client({ token, ...(baseUrl ? { baseUrl } : {}) })
  }
  return _client
}

/** Returns the canonical application URL for QStash callbacks. */
export function getAppUrl(): string {
  // Prefer explicit BETTER_AUTH_URL (set in Vercel production env).
  // Fall back to Vercel deployment URLs. Never fall back to localhost in production.
  const url =
    process.env.BETTER_AUTH_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : null)

  if (!url) {
    throw new Error(
      'Cannot determine application URL. Set BETTER_AUTH_URL or deploy to Vercel.',
    )
  }
  return url.replace(/\/$/, '')
}

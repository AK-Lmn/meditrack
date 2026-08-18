/**
 * Server-only QStash client.
 * Import only in server actions, API routes, or server components.
 * NEVER import this in client components or NEXT_PUBLIC_ files.
 */
import { Client } from '@upstash/qstash'

if (typeof window !== 'undefined') {
  throw new Error('lib/qstash.ts must only be imported on the server side.')
}

// Lazily instantiated so that missing env var doesn't crash at import time
// in environments where QStash isn't configured yet (e.g. test builds).
let _client: Client | null = null

export function getQStashClient(): Client {
  if (!_client) {
    const token = process.env.QSTASH_TOKEN
    if (!token) throw new Error('QSTASH_TOKEN environment variable is not set.')
    _client = new Client({ token })
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

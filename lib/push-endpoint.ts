/**
 * Push endpoints come from the browser, but the server posts to them. Only the push services
 * the browsers use are allowed, so a user cannot make the server call an address they choose.
 */
const EXACT_HOSTS = new Set(['fcm.googleapis.com'])
const HOST_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com']
const MAX_ENDPOINT_LENGTH = 2048

export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
}

/** The p256dh and auth values are unpadded base64url strings. */
export function isValidPushKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(key)
}

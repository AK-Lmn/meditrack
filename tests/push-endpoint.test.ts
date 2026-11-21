import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAllowedPushEndpoint, isValidPushKey } from '../lib/push-endpoint'

const sendNotification = vi.fn()
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }))

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:APA91bExampleToken',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
    'https://web.push.apple.com/QGexample',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts the browser push services: %s', (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true)
  })

  it.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['localhost', 'https://localhost/x'],
    ['loopback IP', 'https://127.0.0.1/x'],
    ['cloud metadata IP', 'https://169.254.169.254/latest/meta-data/'],
    ['private IP', 'https://10.0.0.5/x'],
    ['IPv6 literal', 'https://[::1]/x'],
    ['internal hostname', 'https://internal.service.local/x'],
    ['look-alike suffix', 'https://fcm.googleapis.com.evil.example/x'],
    ['look-alike prefix', 'https://evilfcm.googleapis.com/x'],
    ['look-alike subdomain of the wrong zone', 'https://notify.windows.com.evil.example/x'],
    ['userinfo trick', 'https://fcm.googleapis.com@evil.example/x'],
    ['custom port', 'https://fcm.googleapis.com:8443/x'],
    ['another scheme', 'ftp://fcm.googleapis.com/x'],
    ['not a URL', 'not a url'],
    ['empty string', ''],
    ['bare windows apex', 'https://notify.windows.com/x'],
  ])('rejects %s', (_label, url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false)
  })

  it('rejects absurdly long endpoints and non-strings', () => {
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${'a'.repeat(3000)}`)).toBe(false)
    expect(isAllowedPushEndpoint(undefined as unknown as string)).toBe(false)
  })
})

describe('isValidPushKey', () => {
  it('accepts base64url keys of a sane length and rejects anything else', () => {
    expect(isValidPushKey('BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM')).toBe(true)
    expect(isValidPushKey('tBHItJI5svbpez7KI4CCXg')).toBe(true)
    expect(isValidPushKey('')).toBe(false)
    expect(isValidPushKey('has spaces and <script>')).toBe(false)
    expect(isValidPushKey('a'.repeat(500))).toBe(false)
    expect(isValidPushKey(42 as unknown as string)).toBe(false)
  })
})

describe('sendPushNotification', () => {
  beforeEach(() => {
    sendNotification.mockReset()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public'
    process.env.VAPID_PRIVATE_KEY = 'test-private'
  })

  it('never sends to an endpoint that is not an allowed push service, and marks it expired so it is removed', async () => {
    const { sendPushNotification } = await import('../lib/web-push')
    const result = await sendPushNotification({ endpoint: 'https://169.254.169.254/latest/meta-data/', p256dh: 'p', auth: 'a' }, { title: 't', body: 'b' })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, expired: true })
  })

  it('still sends to an allowed endpoint', async () => {
    sendNotification.mockResolvedValue({})
    const { sendPushNotification } = await import('../lib/web-push')
    const result = await sendPushNotification({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a' }, { title: 't', body: 'b' })
    expect(sendNotification).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true })
  })
})

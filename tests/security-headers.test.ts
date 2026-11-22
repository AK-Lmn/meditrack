import { expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'
import config from '../next.config.mjs'

it('sets baseline security headers across MediTrack', async () => {
  expect(await config.headers?.()).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: '/:path*',
      headers: expect.arrayContaining([
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ]),
    }),
  ]))
})

it('issues a fresh script nonce and rejects a caller-provided nonce', () => {
  const request = new NextRequest('http://localhost/sign-in', { headers: { 'x-nonce': 'supplied' } })
  const policy = proxy(request).headers.get('Content-Security-Policy')
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]{22}==' 'strict-dynamic'/)
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).not.toMatch(/supplied|script-src[^;]*unsafe-inline/)
  expect(proxy(request).headers.get('Content-Security-Policy')).not.toBe(policy)
})

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const origin = 'https://meditrack.example'
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

function loadWorker() {
  type WorkerEvent = { request?: Request; respondWith?: (result: Promise<Response>) => void; waitUntil?: (result: Promise<unknown>) => void }
  const handlers = new Map<string, (event: WorkerEvent) => void>()
  const cached = new Response('static asset')
  const match = vi.fn().mockResolvedValue(cached)
  const deleteCache = vi.fn().mockResolvedValue(true)
  runInNewContext(source, {
    URL,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
      clients: { claim: vi.fn() },
    },
    caches: { match, keys: async () => ['meditrack-static-v1', 'meditrack-static-v2', 'unrelated-cache'], delete: deleteCache },
  })

  return { handlers, match, cached, deleteCache }
}

describe('service worker caching', () => {
  it.each(['/medicines', '/schedule', '/history', '/analytics', '/'])('bypasses the cache for Next.js navigation to %s', (path) => {
    const { handlers, match } = loadWorker()
    const respondWith = vi.fn()
    const request = new Request(`${origin}${path}?_rsc=fixture`, { headers: { RSC: '1', Accept: '*/*' } })

    handlers.get('fetch')?.({ request, respondWith })

    expect(respondWith).not.toHaveBeenCalled()
    expect(match).not.toHaveBeenCalled()
  })

  it('still serves a cached manifest', async () => {
    const { handlers, cached } = loadWorker()
    const respondWith = vi.fn()
    handlers.get('fetch')?.({ request: new Request(`${origin}/manifest.webmanifest`), respondWith })

    expect(await respondWith.mock.calls[0]?.[0]).toBe(cached)
  })

  it('removes the previous cache on activation', async () => {
    const { handlers, deleteCache } = loadWorker()
    const waitUntil = vi.fn()
    handlers.get('activate')?.({ waitUntil })
    await waitUntil.mock.calls[0]?.[0]

    expect(deleteCache).toHaveBeenCalledExactlyOnceWith('meditrack-static-v1')
  })
})

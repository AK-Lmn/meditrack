import { timingSafeEqual } from 'node:crypto'
import { reconcileMissedDoses } from '@/lib/reconcile-missed-doses'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorized = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || authorized.length !== expected.length || !timingSafeEqual(authorized, expected)) {
    return new Response(null, { status: 401 })
  }

  const recorded = await reconcileMissedDoses()
  return Response.json({ recorded }, { headers: { 'Cache-Control': 'no-store' } })
}

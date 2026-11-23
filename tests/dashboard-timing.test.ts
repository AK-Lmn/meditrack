import { expect, it } from 'vitest'
import * as timing from '@/lib/dashboard-timing'

it('measures readiness from the latest dashboard navigation and consumes its start', () => {
  const start = Reflect.get(timing, 'markDashboardNavigation')
  const ready = Reflect.get(timing, 'measureDashboardReady')
  expect(start).toBeTypeOf('function')
  start('/', performance)
  const mark = performance.getEntriesByName('meditrack:dashboard-start').at(-1)!
  ready(performance)
  expect(performance.getEntriesByName('meditrack:dashboard-ready').at(-1)?.startTime).toBe(mark.startTime)
  expect(performance.getEntriesByName('meditrack:dashboard-start')).toHaveLength(0)
})

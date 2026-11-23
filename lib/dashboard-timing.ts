const startMark = 'meditrack:dashboard-start'

export function markDashboardNavigation(url: string, clock = performance) {
  clock.clearMarks(startMark)
  if (new URL(url, 'https://meditrack.invalid').pathname === '/') clock.mark(startMark)
}

export function measureDashboardReady(clock = performance) {
  const start = clock.getEntriesByName(startMark, 'mark').at(-1)?.startTime ?? 0
  clock.clearMarks(startMark)
  clock.clearMeasures('meditrack:dashboard-ready')
  clock.measure('meditrack:dashboard-ready', { start })
}

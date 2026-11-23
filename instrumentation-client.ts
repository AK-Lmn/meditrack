import { markDashboardNavigation } from '@/lib/dashboard-timing'

export function onRouterTransitionStart(url: string) {
  markDashboardNavigation(url)
}

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { MedicationList } from '@/components/meditrack-dashboard'

function renderMedicationCard() {
  return renderToStaticMarkup(createElement(MedicationList, {
    filtered: [{ id: 1, name: 'Test medication', dosage: '1 tablet', scheduleTimes: ['08:00'], frequency: 'Daily', instructions: null, color: 'blue', active: true, todayOccurrences: [] }],
    takenIds: new Set<number>(),
    pendingDoseId: null,
    setShowAdd: vi.fn(),
    toggleDose: vi.fn(),
    manage: { edit: vi.fn(), request: vi.fn() },
  }))
}

it('shows that a daily medicine with no occurrence has no dose today', () => {
  const markup = renderMedicationCard()
  expect(markup).toContain('No dose scheduled today')
  expect(markup).not.toMatch(/Upcoming|Scheduled today/)
})

it('exposes the medication actions as a collapsed menu button', () => {
  const trigger = renderMedicationCard().match(/<button[^>]*aria-label="More actions for Test medication"[^>]*>/)?.[0] ?? ''
  expect(trigger).toContain('aria-haspopup="menu"')
  expect(trigger).not.toContain('aria-expanded="true"')
})

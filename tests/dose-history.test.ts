import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DoseAnalytics, DoseHistory, type DoseHistoryEntry } from '../components/dose-history'

const timezone = 'Asia/Singapore'
const doses: DoseHistoryEntry[] = [
  { id: 1, medicationId: 3, name: 'Archived QA medication', dosage: '1 test unit', scheduledAt: '2026-11-20T16:10:00Z', takenAt: '2026-11-20T16:13:00Z', status: 'taken' },
  { id: 2, medicationId: 3, name: 'Archived QA medication', dosage: '1 test unit', scheduledAt: '2026-11-21T12:00:00Z', status: 'missed' },
  { id: 3, medicationId: 3, name: 'Archived QA medication', dosage: '1 test unit', scheduledAt: '2026-11-14T16:00:00Z', status: 'taken' },
]

describe('dose records in the dashboard views', () => {
  it('renders medication, dosage, status, and account-local time in history', () => {
    const html = renderToStaticMarkup(createElement(DoseHistory, { doses, timezone }))
    expect(html).toContain('Archived QA medication · 1 test unit')
    expect(html).toMatch(/Nov 21, 2026.*12:10 AM/)
    expect(html).toContain('Missed')
    expect(html).toContain('All statuses')
  })

  it('groups doses by account-local date and excludes records outside seven days', () => {
    const html = renderToStaticMarkup(createElement(DoseAnalytics, { doses, timezone, today: '2026-11-22' }))
    expect(html).toContain('1 of 2 recorded doses taken (50%).')
    expect(html).toContain('1/2 taken')
    expect(html).toContain('width:50%')
  })
})

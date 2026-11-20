'use client'

import { useState } from 'react'
import { calculateAdherenceScore, type AdherenceInputRecord } from '@/lib/adherence'
import { addDaysToDateString, formatLocalDate, localDatetimeToUtc } from '@/lib/scheduler'

export type DoseHistoryEntry = AdherenceInputRecord & {
  id: number
  medicationId: number
  name: string
  dosage: string | null
}

const statusLabels: Record<string, string> = {
  scheduled: 'Scheduled', taken: 'Taken', missed: 'Missed', skipped: 'Skipped',
}
const panel = 'rounded-2xl border border-[#e5eaf1] bg-white p-5 dark:border-[#254258] dark:bg-[#132b3b]'
const field = 'app-focus min-h-11 w-full rounded-lg border border-[#e3e8ee] bg-[#fbfcfd] px-3 text-sm dark:border-[#315069] dark:bg-[#173247]'

export function DoseHistory({ doses, timezone, recent = false }: { doses: DoseHistoryEntry[]; timezone: string; recent?: boolean }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')
  const format = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })
  const visible = doses.filter((dose) => dose.name.toLowerCase().includes(query.trim().toLowerCase())
    && (!status || dose.status === status)
    && (!date || formatLocalDate(new Date(dose.scheduledAt), timezone) === date))
  const rows = recent ? visible.slice(0, 5) : visible

  return <section className={`${panel}${recent ? ' mt-6' : ''}`}>
    <h2 className="text-base font-bold">Medication history</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs font-semibold">Medication
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medication" className={field} />
      </label>
      {!recent && <>
        <label className="grid gap-1 text-xs font-semibold">Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={field}>
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} />
        </label>
      </>}
    </div>
    {rows.length ? <ul className="mt-4 space-y-2">
      {rows.map((dose) => {
        const scheduled = new Date(dose.scheduledAt)
        return <li key={dose.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#edf0f4] p-3 text-sm dark:border-[#315069]">
          <div className="min-w-0 break-words">
            <div className="font-semibold">{dose.name}{dose.dosage && ` · ${dose.dosage}`}</div>
            <time dateTime={scheduled.toISOString()}>Scheduled {format.format(scheduled)}</time>
            {dose.takenAt && <div><time dateTime={new Date(dose.takenAt).toISOString()}>Taken {format.format(new Date(dose.takenAt))}</time></div>}
          </div>
          <span className="font-semibold">{statusLabels[dose.status] ?? 'Unknown'}</span>
        </li>
      })}
    </ul> : <p className="mt-4 text-sm">{doses.length ? 'No doses match these filters.' : 'No dose records yet.'}</p>}
  </section>
}

export function DoseAnalytics({ doses, today, timezone }: { doses: DoseHistoryEntry[]; today: string; timezone: string }) {
  const formatDay = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone })
  const dates = Array.from({ length: 7 }, (_, index) => addDaysToDateString(today, index - 6))
  const byDate = new Map(dates.map((date) => [date, [] as DoseHistoryEntry[]]))
  for (const dose of doses) byDate.get(formatLocalDate(new Date(dose.scheduledAt), timezone))?.push(dose)
  const total = calculateAdherenceScore(Array.from(byDate.values()).flat())

  return <section className={panel}>
    <h2 className="text-base font-bold">Adherence over the last 7 days</h2>
    <p className="mt-2 text-sm">{total.totalScheduled ? `${total.takenCount} of ${total.totalScheduled} recorded doses taken (${total.adherenceRate}%).` : 'No doses recorded in this period.'}</p>
    <ul aria-label="Daily adherence chart" className="mt-5 space-y-3">
      {dates.map((date) => {
        const day = calculateAdherenceScore(byDate.get(date) ?? [])
        return <li key={date} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:gap-4 sm:text-sm">
          <time dateTime={date}>{formatDay.format(localDatetimeToUtc(date, '12:00', timezone))}</time>
          <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-[#edf0f4] dark:bg-[#0d2230]">
            <div className="h-full rounded-full bg-[#1e7b8c] dark:bg-[#75c6c0]" style={{ width: `${day.adherenceRate}%` }} />
          </div>
          <span className="text-right tabular-nums">{day.totalScheduled ? `${day.takenCount}/${day.totalScheduled} taken` : 'No records'}</span>
        </li>
      })}
    </ul>
  </section>
}

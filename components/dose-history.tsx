'use client'

import { useState } from 'react'
import { calculateAdherenceScore, calculateStreak, type AdherenceInputRecord } from '@/lib/adherence'
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
const panel = 'rounded-2xl border border-[#c4d7cf] bg-white p-5 dark:border-[#48675a] dark:bg-[#1c3029]'
const field = 'app-focus min-h-11 w-full rounded-lg border border-[#e3e8ee] bg-[#fbfcfd] px-3 text-sm dark:border-[#48675a] dark:bg-[#284739]'

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
        return <li key={dose.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[#d8e5df] p-3 text-sm dark:border-[#48675a]">
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
  const streak = calculateStreak(doses, localDatetimeToUtc(today, '12:00', timezone), timezone)

  return <section className={panel}>
    <h2 className="text-base font-bold">Adherence over the last 7 days</h2>
    <p className="mt-2 text-sm">{total.totalScheduled ? `${total.takenCount} of ${total.totalScheduled} recorded doses taken (${total.adherenceRate}%).` : 'No doses recorded in this period.'}</p>
    <ul aria-label="Daily adherence chart" className="mt-5 grid grid-cols-7 gap-2 sm:gap-4">
      {dates.map((date) => {
        const day = calculateAdherenceScore(byDate.get(date) ?? [])
        return <li key={date} className="grid justify-items-center gap-2 text-xs">
          <div aria-hidden="true" className="flex h-24 w-full items-end overflow-hidden rounded bg-background sm:h-36">
            <div className="w-full rounded bg-primary" style={{ height: `${day.adherenceRate}%` }} />
          </div>
          <time dateTime={date} aria-label={formatDay.format(localDatetimeToUtc(date, '12:00', timezone))}>{Number(date.slice(-2))}</time>
          <span className="tabular-nums" aria-label={day.totalScheduled ? day.takenCount + "/" + day.totalScheduled + " taken" : undefined}>{day.totalScheduled ? `${day.takenCount}/${day.totalScheduled}` : <><span aria-hidden="true">—</span><span className="sr-only">No records</span></>}</span>
        </li>
      })}
    </ul>
    <dl className="mt-5 border-t border-border">
      <div className="weekbook-row"><dt>Missed recorded doses</dt><dd>{total.missedCount}</dd></div>
      <div className="weekbook-row"><dt>Current streak</dt><dd>{streak.currentStreak} {streak.currentStreak === 1 ? 'day' : 'days'}</dd></div>
    </dl>
  </section>
}

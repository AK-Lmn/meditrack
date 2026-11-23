'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { archiveMedication, createMedication, deleteMedication, editMedication, restoreMedication } from '@/app/actions/medications'
import { takeDose, undoDose } from '@/app/actions/doses'
import { dismissNotification, getNotificationState, markNotificationRead, refreshNotifications, savePushSubscription, takeNotificationDose, updateNotificationSettings } from '@/app/actions/notifications'
import { WeekbookBrand } from '@/components/weekbook-brand'
import { getWeekbookDays } from '@/lib/weekbook'
import { AccountSettings } from '@/components/account-settings'
import { FieldErrorMessage, fieldErrorAttributes, useFieldErrors } from '@/components/field-errors'
import { DoseAnalytics, DoseHistory, type DoseHistoryEntry } from '@/components/dose-history'
import { ThemeSelect } from '@/components/theme-provider'
import { signOutCurrentDevice } from '@/lib/auth-client'
import { measureDashboardReady } from '@/lib/dashboard-timing'
import { getDailyDoseState } from '@/lib/daily-dose-state'
import { addDaysToDateString, formatLocalDate, generateDailyOccurrences, getDoseDisplayStatus, localDatetimeToUtc, MISSED_DOSE_WINDOW_MS, type DoseDisplayStatus, type ScheduledOccurrence } from '@/lib/scheduler'
import { supportedTimezones } from '@/lib/timezone-display'
import { validateDosage, validateMedicationName, validateTimeFormat } from '@/lib/validation'
import { Bell, CalendarDays, Check, CheckCircle2, Clock3, Download, FileText, LogOut, MoreHorizontal, Pill, Plus, Search, Settings, TrendingUp, Undo2, X } from 'lucide-react'

type MedicationSummary = { id: number; name: string; dosage: string }
type MedicationAction = 'archive' | 'delete' | 'restore'
type MedicationConfirmation = { action: MedicationAction; medicine: MedicationSummary }
type ManageMedication = { edit: (medicine: Medication) => void; request: (action: MedicationAction, medicine: MedicationSummary) => void }
type Medication = MedicationSummary & { scheduleTimes: string[]; frequency: string; instructions: string | null; color: string; active: boolean; todayOccurrences: ScheduledOccurrence[]; doseStatus?: DoseDisplayStatus }
type Dose = { medicationId: number; status: string; scheduledAt: Date | string }
type NotificationRow = { id: number; medicationId: number | null; title: string; message: string; read: boolean; createdAt: Date | string }
type NotificationSettings = { medicationReminders: boolean; browserNotifications: boolean; timezone: string; reminderMinutesBefore: number }
type ToastMessage = { id: number; kind: 'success' | 'error'; text: string; undoMedicationId?: number; undoScheduledAt?: Date }
type NotificationStatus = 'loading' | 'ready' | 'error'
const managementButton = 'app-focus min-h-10 rounded-md px-3 text-left text-xs font-bold text-[#526277] hover:bg-[#edf5f2] dark:text-[#b4d0c5] dark:hover:bg-[#284739]'
const destructiveManagementButton = 'app-focus min-h-10 rounded-md px-3 text-left text-xs font-bold text-[#a34f5a] hover:bg-[#fff2f2] dark:text-[#e9a0a9] dark:hover:bg-[#3a1f2a]'

const nav = [
  ['Week', '/', CalendarDays],
  ['Schedule', '/schedule', Clock3],
  ['Medications', '/medicines', Pill],
  ['History', '/history', FileText],
  ['Analytics', '/analytics', TrendingUp],
  ['Settings', '/settings', Settings],
] as const

export default function MediTrackDashboard({ medications: initialMedications, archivedMedications, doses, user, initialTimezone, initialNow }: { medications: Medication[]; archivedMedications: MedicationSummary[]; doses: DoseHistoryEntry[]; user: { name: string; email: string }; initialTimezone: string | null; initialNow: number }) {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (pathname !== '/') return
    let paintedFrame = 0
    const frame = requestAnimationFrame(() => {
      paintedFrame = requestAnimationFrame(() => measureDashboardReady())
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(paintedFrame)
    }
  }, [pathname])
  const activeLabel = nav.find((item) => item[1] === pathname)?.[0] ?? 'Week'
  const [showAdd, setShowAdd] = useState(false)
  const [editCandidate, setEditCandidate] = useState<Medication | null>(null)
  const [confirmation, setConfirmation] = useState<MedicationConfirmation | null>(null)
  const [managing, startManaging] = useTransition()
  const [query, setQuery] = useState('')
  const [, startTransition] = useTransition()
  const [pendingDoseId, setPendingDoseId] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>('loading')
  const [settings, setSettings] = useState<NotificationSettings>({ medicationReminders: true, browserNotifications: false, reminderMinutesBefore: 0, timezone: initialTimezone ?? 'UTC' })
  const [permissionMessage, setPermissionMessage] = useState('')
  const [offline, setOffline] = useState(false)
  const [installEvent, setInstallEvent] = useState<Event | null>(null)

  const [clock, setClock] = useState(initialNow)
  const now = new Date(Math.max(clock, initialNow))
  async function signOutDevice() {
    try {
      await signOutCurrentDevice()
      window.location.replace('/sign-in')
    } catch {
      setToast({ id: Date.now(), kind: 'error', text: 'Could not sign out. Try again.' })
    }
  }

  function takeReminderDose(id: number, medicationId: number | null) {
    if (!medicationId) return
    startTransition(async () => {
      try {
        await takeNotificationDose(id)
        setNotifications((items) => items.filter((item) => item.id !== id))
        setNotificationOpen(false)
        setToast({ id: Date.now(), kind: 'success', text: 'Dose marked as taken.' })
        router.refresh()
      } catch {
        setToast({ id: Date.now(), kind: 'error', text: 'Unable to mark the scheduled dose as taken.' })
      }
    })
  }
  const timezone = initialTimezone ?? 'UTC'
  const today = formatLocalDate(now, timezone)
  const dailyStates = new Map(initialMedications.map((medicine) => [
    medicine.id,
    getDailyDoseState(medicine.todayOccurrences.filter((dose) => dose.localDate === today), doses.filter((dose) => dose.medicationId === medicine.id), today, timezone),
  ]))
  const medications = initialMedications.map((medicine) => {
    const todayOccurrences = medicine.todayOccurrences.filter((dose) => dose.localDate === today)
    const statuses = todayOccurrences.map((dose) => getDoseDisplayStatus(dose.scheduledUtc, now, findDoseLog(doses, medicine.id, dose)?.status))
    const doseStatus = statuses.find((status) => status === 'missed')
      ?? statuses.find((status) => status === 'overdue')
      ?? statuses[0]
    return { ...medicine, todayOccurrences, doseStatus }
  })
  const takenIds = new Set([...dailyStates].filter(([, state]) => state.complete).map(([id]) => id))
  const filtered = medications.filter((medicine) => medicine.name.toLowerCase().includes(query.toLowerCase()))
  const unread = notifications.filter((item) => !item.read).length
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 15_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const serverDay = formatLocalDate(new Date(initialNow), timezone)
    const midnight = localDatetimeToUtc(addDaysToDateString(serverDay, 1), '00:00', timezone).getTime()
    const deadlines = initialMedications.flatMap((medicine) => medicine.todayOccurrences)
      .map((dose) => dose.scheduledUtc.getTime() + MISSED_DOSE_WINDOW_MS)
      .filter((deadline) => deadline > initialNow)
    const timeout = window.setTimeout(() => {
      setClock(Date.now())
      router.refresh()
    }, Math.max(0, Math.min(midnight, ...deadlines) - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [initialMedications, initialNow, router, timezone])

  const [vapidConfigured, setVapidConfigured] = useState(false)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const endpoint = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return undefined
      const registration = await navigator.serviceWorker.getRegistration()
      return (await registration?.pushManager.getSubscription())?.endpoint
    }
    endpoint().catch(() => undefined).then((value) => getNotificationState(value)).then((state) => {
      setNotifications(state.notifications)
      setNotificationStatus('ready')
      const timezone = initialTimezone === null && state.settings.timezone === 'UTC'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : state.settings.timezone
      setSettings({ medicationReminders: state.settings.medicationReminders, browserNotifications: state.settings.browserNotifications, reminderMinutesBefore: state.settings.reminderMinutesBefore, timezone })
      setVapidConfigured(state.vapidConfigured)
      setHasActiveSubscription(state.hasActiveSubscription)
    }).catch(() => setNotificationStatus('error'))
  }, [initialTimezone])

  useEffect(() => {
    let disposed = false
    let refreshing = false

    async function refresh() {
      if (document.visibilityState !== 'visible' || !navigator.onLine || refreshing) return
      refreshing = true
      try {
        const rows = await refreshNotifications()
        if (!disposed) {
          setNotifications(rows)
          setNotificationStatus('ready')
        }
      } catch {
        // Keep the last visible inbox. The next interval or focus change retries.
      } finally {
        refreshing = false
      }
    }

    const interval = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event) }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('beforeinstallprompt', beforeInstall) }
  }, [])

  const manage: ManageMedication = {
    edit: setEditCandidate,
    request: (action, medicine) => setConfirmation({ action, medicine }),
  }

  function confirmMedicationAction() {
    if (!confirmation) return
    const { action, medicine } = confirmation
    startManaging(async () => {
      try {
        const mutation = { archive: archiveMedication, delete: deleteMedication, restore: restoreMedication }[action]
        await mutation(medicine.id)
        const result = { archive: 'archived', delete: 'deleted', restore: 'restored' }[action]
        setToast({ id: Date.now(), kind: 'success', text: `${medicine.name} ${result}.` })
        router.refresh()
      } catch {
        setToast({ id: Date.now(), kind: 'error', text: `Unable to ${action} ${medicine.name}.` })
      } finally {
        setConfirmation(null)
      }
    })
  }

  async function toggleDose(id: number) {
    const medicine = medications.find((item) => item.id === id)
    const wasTaken = takenIds.has(id)
    setPendingDoseId(id)
    try {
      const scheduledAt = dailyStates.get(id)?.target ?? new Date()
      if (wasTaken) await undoDose(id, scheduledAt)
      else await takeDose(id, scheduledAt)
      setToast({ id: Date.now(), kind: 'success', text: wasTaken ? `${medicine?.name ?? 'Medication'} returned to scheduled.` : `${medicine?.name ?? 'Medication'} marked as taken.`, undoMedicationId: wasTaken ? undefined : id, undoScheduledAt: scheduledAt })
      router.refresh()
    } catch {
      setToast({ id: Date.now(), kind: 'error', text: 'Unable to update this dose. Please try again.' })
    } finally {
      setPendingDoseId(null)
    }
  }

  async function undoToastDose(id: number) {
    setPendingDoseId(id)
    try {
      await undoDose(id, toast?.undoScheduledAt)
      setToast({ id: Date.now(), kind: 'success', text: 'Dose returned to scheduled.' })
      router.refresh()
    } catch {
      setToast({ id: Date.now(), kind: 'error', text: 'Unable to undo that change. Please try again.' })
    } finally {
      setPendingDoseId(null)
    }
  }

  async function enableBrowserNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionMessage('Browser notifications are not supported here.')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission === 'denied') {
      setPermissionMessage('Notifications are blocked by your browser. You can enable them in your browser settings.')
      return
    }
    if (permission !== 'granted') {
      setPermissionMessage('Notifications were not enabled.')
      return
    }
    const state = await getNotificationState()
    if (!state.vapidConfigured || !state.publicVapidKey) {
      setPermissionMessage('Notifications are temporarily unavailable on this device. Please try again later.')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(state.publicVapidKey) })
    await savePushSubscription(subscription.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } })
    await updateNotificationSettings({ ...settings, browserNotifications: true })
    setSettings((current) => ({ ...current, browserNotifications: true }))
    setHasActiveSubscription(true)
    setPermissionMessage('Browser notifications are enabled for this device.')
  }

  return <div className="min-h-screen bg-[#edf5f2] text-[#15302b] dark:bg-[#14241f] dark:text-[#ecf8f2]">
    {offline && <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#c58b35] px-4 py-2 text-center text-xs font-bold text-[#15302b]">You&apos;re offline. Medication changes need an active connection.</div>}
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <Link href="/" className="app-focus rounded-md"><WeekbookBrand /></Link>
        <div className="flex items-center gap-2"><InstallButton installEvent={installEvent} onDone={() => setInstallEvent(null)} /><div className="hidden sm:block"><ThemeSelect compact /></div><Dialog.Root open={notificationOpen} onOpenChange={setNotificationOpen}><Dialog.Trigger className="app-focus relative flex h-11 w-11 items-center justify-center rounded-lg text-copy-muted hover:bg-[#edf5f2] dark:text-[#bdd5df] dark:hover:bg-[#284739]" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}><Bell size={19} aria-hidden="true" />{unread > 0 && <span aria-hidden="true" className="absolute right-2 top-2 min-w-4 rounded-full bg-[#bd6570] px-1 text-[10px] font-bold text-white">{unread}</span>}</Dialog.Trigger><NotificationPanel status={notificationStatus} notifications={notifications} onRead={(id) => startTransition(async () => { await markNotificationRead(id); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)) })} onDismiss={(id) => startTransition(async () => { await dismissNotification(id); setNotifications((items) => items.filter((item) => item.id !== id)) })} onTake={takeReminderDose} /></Dialog.Root></div>
      </div>
      <nav aria-label="Primary" className="mx-auto flex max-w-4xl flex-wrap gap-x-1 px-3 pb-2 sm:px-5">
        {nav.map(([label, href, Icon]) => <Link key={href} href={href} aria-current={activeLabel === label ? "page" : undefined} className="weekbook-link app-focus"><Icon size={15} aria-hidden="true" />{label}</Link>)}
      </nav>
    </header>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {activeLabel !== "Week" && <h1 className="weekbook-title mb-5">{activeLabel}</h1>}
        {activeLabel === 'Settings' ? <SettingsView user={user} settings={settings} permissionMessage={permissionMessage} vapidConfigured={vapidConfigured} hasActiveSubscription={hasActiveSubscription} onToggleReminders={(enabled) => startTransition(async () => { await updateNotificationSettings({ ...settings, medicationReminders: enabled }); setSettings((current) => ({ ...current, medicationReminders: enabled })) })} onToggleTimezone={(tz) => startTransition(async () => { await updateNotificationSettings({ ...settings, timezone: tz }); setSettings((current) => ({ ...current, timezone: tz })) })} onEnableBrowser={enableBrowserNotifications} onSignOut={signOutDevice} /> : <DashboardView activeLabel={activeLabel} medications={medications} archivedMedications={archivedMedications} doses={doses} timezone={timezone} today={today} now={now} filtered={filtered} takenIds={takenIds} pendingDoseId={pendingDoseId} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} manage={manage} />}
    </main>
    {(showAdd || editCandidate) && <MedicationForm key={editCandidate?.id ?? 'new'} medication={editCandidate} onClose={() => { setShowAdd(false); setEditCandidate(null) }} onSaved={() => {
      setShowAdd(false)
      setEditCandidate(null)
      setToast({ id: Date.now(), kind: 'success', text: editCandidate ? 'Medication updated successfully.' : 'Medication added successfully.' })
      router.refresh()
    }} />}
    <MedicationActionDialog confirmation={confirmation} pending={managing} onClose={() => setConfirmation(null)} onConfirm={confirmMedicationAction} />
    {toast && <AppToast toast={toast} pending={pendingDoseId !== null} onUndo={undoToastDose} onDismiss={() => setToast(null)} />}
  </div>
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function DashboardView(props: { activeLabel: string; medications: Medication[]; archivedMedications: MedicationSummary[]; doses: DoseHistoryEntry[]; timezone: string; today: string; now: Date; filtered: Medication[]; takenIds: Set<number>; pendingDoseId: number | null; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; manage: ManageMedication }) {
  const { activeLabel, medications, filtered, takenIds, pendingDoseId, query, setQuery, setShowAdd, toggleDose, manage } = props
  if (activeLabel === 'Medications') return <MedicinesView archivedMedications={props.archivedMedications} filtered={filtered} takenIds={takenIds} pendingDoseId={pendingDoseId} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} manage={manage} />
  if (activeLabel === 'Schedule') return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-copy-muted">Daily reminders · {props.timezone}</p>
      <button type="button" onClick={() => setShowAdd(true)} className="weekbook-action app-focus"><Plus size={16} aria-hidden="true" /> Add medication</button>
    </div>
    <div className="weekbook-detail"><ScheduleView medications={medications} doses={props.doses} now={props.now} /></div>
  </>
  if (activeLabel === 'History') return <DoseHistory doses={props.doses} timezone={props.timezone} />
  if (activeLabel === 'Analytics') return <DoseAnalytics doses={props.doses} today={props.today} timezone={props.timezone} />
  return <Weekbook key={props.today} medications={medications} doses={props.doses} timezone={props.timezone} today={props.today} now={props.now} onAdd={() => setShowAdd(true)} />
}

function Weekbook({ medications, doses, today, timezone, now, onAdd }: {
  medications: Medication[]
  doses: DoseHistoryEntry[]
  today: string
  timezone: string
  now: Date
  onAdd: () => void
}) {
  const [date, selectDate] = useState(today)
  const days = getWeekbookDays(today, timezone, doses)
  const selected = days.find((day) => day.date === date) ?? days[3]
  const dateValue = (day: string) => new Date(day + 'T12:00:00Z')
  const heading = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  const weekday = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
  const fullDate = new Intl.DateTimeFormat('en', { dateStyle: 'full', timeZone: 'UTC' })
  const time = new Intl.DateTimeFormat('en', { timeStyle: 'short', timeZone: timezone })
  const todayScheduled = medications.flatMap((medicine) => medicine.todayOccurrences.map((dose) => ({ medicine, dose })))
  const todayTaken = todayScheduled.filter(({ medicine, dose }) => findDoseLog(doses, medicine.id, dose)?.status === 'taken').length
  const preview = date > today ? medications.flatMap((medicine) =>
    medicine.frequency.toLowerCase().includes('needed') ? [] :
      generateDailyOccurrences(medicine.id, medicine.scheduleTimes, date, 1, timezone)
        .map((dose) => ({ medicine, dose })),
  ).sort((a, b) => a.dose.scheduledUtc.getTime() - b.dose.scheduledUtc.getTime()) : []

  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="weekbook-title">{heading.formatRange(dateValue(days[0].date), dateValue(days[6].date))}</h1>
        <p className="mt-1 text-sm text-copy-muted">Medication history and schedule</p>
      </div>
      <button type="button" onClick={onAdd} className="weekbook-action app-focus"><Plus size={16} aria-hidden="true" /> Add medication</button>
    </div>
    <div role="group" aria-label="Select a day" className="mb-4 grid grid-cols-7 gap-1 sm:gap-2">
      {days.map((day) => {
        const value = dateValue(day.date)
        const count = day.date === today ? todayScheduled.length : day.recorded
        const taken = day.date === today ? todayTaken : day.taken
        return <button key={day.date} type="button" aria-pressed={date === day.date} aria-label={fullDate.format(value) + (day.date === today ? ', today' : '') + (count ? ', ' + taken + ' of ' + count + ' doses taken' : '')} onClick={() => selectDate(day.date)} className="weekbook-day app-focus">
          <span>{weekday.format(value)}</span>
          <strong>{value.getUTCDate()}</strong>
          <span>{count ? taken + '/' + count : '—'}</span>
        </button>
      })}
    </div>
    <div className="weekbook-detail">
      {date === today ? <ScheduleView medications={medications} doses={doses} now={now} label={heading.format(dateValue(date))} /> :
        <section className="p-4 sm:p-5">
          <h2 className="font-bold">{heading.format(dateValue(date))}</h2>
          {date < today ? selected.entries.length ? <ul className="mt-2">
            {selected.entries.map((entry) => <li key={entry.id} className="weekbook-row">
              <div><strong>{entry.name}</strong><p className="text-copy-muted">{[entry.dosage, time.format(new Date(entry.scheduledAt))].filter(Boolean).join(' · ')}</p></div>
              <span className="capitalize">{entry.status}</span>
            </li>)}
          </ul> : <p className="mt-2 text-sm text-copy-muted">No dose records for this day.</p> :
            preview.length ? <ul className="mt-2">
              {preview.map(({ medicine, dose }) => <li key={dose.occurrenceKey} className="weekbook-row">
                <div><strong>{medicine.name}</strong><p className="text-copy-muted">{medicine.dosage}</p></div>
                <time dateTime={dose.scheduledUtc.toISOString()}>{time.format(dose.scheduledUtc)}</time>
              </li>)}
            </ul> : <p className="mt-2 text-sm text-copy-muted">No doses scheduled.</p>}
        </section>}
    </div>
    {medications.some((medicine) => medicine.frequency.toLowerCase().includes('needed')) &&
      <Link href="/medicines" className="app-focus mt-4 inline-block rounded text-sm font-semibold text-primary underline">Log an as-needed medication</Link>}
  </>
}

export function MedicationList({ filtered, takenIds, pendingDoseId, setShowAdd, toggleDose, manage, title = "Today's medications", subtitle = "Your active prescriptions and today's dose status." }: { filtered: Medication[]; takenIds: Set<number>; pendingDoseId: number | null; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; manage: ManageMedication; title?: string; subtitle?: string }) {
  return (
    <section className="rounded-2xl border border-[#c4d7cf] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6 dark:border-[#48675a] dark:bg-[#1c3029]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-1 text-xs text-copy-muted dark:text-[#b4d0c5]">{subtitle}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="app-focus flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#155b48] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#104b3b]" aria-label="Add medication">
          <Plus size={15} /> Add
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {filtered.length ? filtered.map((medicine) => {
          const isTaken = takenIds.has(medicine.id)
          const hasScheduledDose = medicine.todayOccurrences.length > 0
          const isAsNeeded = medicine.frequency.toLowerCase().includes('needed')
          return (
            <article key={medicine.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d9ede4] text-[#155b48] dark:bg-[#284739] dark:text-[#9de6ca]">
                <Pill size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-bold sm:text-[15px]">{medicine.name}</h3>
                  {(isTaken || isAsNeeded || hasScheduledDose) && <StatusBadge status={isTaken ? 'taken' : medicine.doseStatus === 'missed' || medicine.doseStatus === 'overdue' ? medicine.doseStatus : isAsNeeded ? 'as-needed' : 'upcoming'} />}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#536479] dark:text-[#d4e2e8]">{medicine.dosage}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-copy-muted dark:text-[#b4d0c5]">
                  <Clock3 size={13} aria-hidden="true" /> <span>{medicine.frequency}{hasScheduledDose && ` · Due ${medicine.todayOccurrences.map((dose) => dose.timeOfDay).join(', ')}`}{isTaken ? ' · Completed today' : hasScheduledDose ? ' · Scheduled today' : !isAsNeeded && ' · No dose scheduled today'}</span>
                </div>
              </div>
              <button
                disabled={pendingDoseId === medicine.id}
                aria-label={`${isTaken ? 'Undo' : 'Mark'} ${medicine.name} as taken`}
                onClick={() => toggleDose(medicine.id)}
                className={`app-focus col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold transition sm:col-span-1 ${isTaken ? 'border-[#b9dfcb] bg-[#eaf8f0] text-[#276c4a] dark:border-[#2c6b4b] dark:bg-[#143c31] dark:text-[#8bd9ad]' : 'border-[#155b48] bg-[#155b48] text-white hover:bg-[#104b3b]'} disabled:cursor-wait disabled:opacity-60`}
              >
                {isTaken ? <Undo2 size={15} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                <span>{pendingDoseId === medicine.id ? 'Updating…' : isTaken ? 'Undo taken' : 'Mark taken'}</span>
              </button>
              <BaseMenu.Root>
                <BaseMenu.Trigger className="app-focus flex h-11 w-11 items-center justify-center self-center justify-self-end rounded-lg text-[#526277] hover:bg-[#edf5f2] dark:text-[#bdd5df] dark:hover:bg-[#284739]" aria-label={`More actions for ${medicine.name}`}>
                  <MoreHorizontal size={19} aria-hidden="true" />
                </BaseMenu.Trigger>
                <BaseMenu.Portal>
                  <BaseMenu.Positioner side="top" align="end" sideOffset={6} className="z-40">
                    <BaseMenu.Popup className="grid w-40 rounded-lg border border-[#c4d7cf] bg-white p-1.5 shadow-lg dark:border-[#48675a] dark:bg-[#284739]">
                      <BaseMenu.Item onClick={() => manage.edit(medicine)} className={`${managementButton} flex cursor-pointer items-center data-highlighted:bg-[#edf5f2] dark:data-highlighted:bg-[#182b24]`}>Edit</BaseMenu.Item>
                      <BaseMenu.Item onClick={() => manage.request('archive', medicine)} className={`${managementButton} flex cursor-pointer items-center data-highlighted:bg-[#edf5f2] dark:data-highlighted:bg-[#182b24]`}>Archive</BaseMenu.Item>
                      <BaseMenu.Item onClick={() => manage.request('delete', medicine)} className={`${destructiveManagementButton} flex cursor-pointer items-center data-highlighted:bg-[#fff2f2] dark:data-highlighted:bg-[#3a1f2a]`}>Delete permanently</BaseMenu.Item>
                    </BaseMenu.Popup>
                  </BaseMenu.Positioner>
                </BaseMenu.Portal>
              </BaseMenu.Root>
            </article>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-[#c4d7cf] px-6 py-12 text-center dark:border-[#48675a]">
            <Pill className="mx-auto text-copy-muted dark:text-[#a9b6c3]" size={28} />
            <p className="mt-3 text-sm font-bold">Your medication list is empty</p>
            <p className="mt-1 text-xs text-copy-muted dark:text-[#b4d0c5]">Add a prescription to begin tracking doses.</p>
            <button onClick={() => setShowAdd(true)} className="app-focus mt-4 min-h-11 rounded-lg bg-[#155b48] px-4 py-2 text-xs font-bold text-white">Add medication</button>
          </div>
        )}
      </div>
    </section>
  )
}

/** Dedicated full-screen medicines management view (route: /medicines). */
function findDoseLog(doses: Dose[], medicationId: number, occurrence: ScheduledOccurrence) {
  return doses.find((dose) => dose.medicationId === medicationId && new Date(dose.scheduledAt).getTime() === occurrence.scheduledUtc.getTime())
}

function ScheduleView({ medications, doses, now, label = "Today's doses" }: { medications: Medication[]; doses: Dose[]; now: Date; label?: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const scheduledDoses = medications.flatMap((medicine) => medicine.todayOccurrences.map((dose) => ({ medicine, dose })))
    .sort((a, b) => a.dose.scheduledUtc.getTime() - b.dose.scheduledUtc.getTime())

  return <section className="bg-card p-4 sm:p-5">
    <h2 className="text-base font-bold">{label}</h2>
    {scheduledDoses.length ? <ul className="mt-2">
      {scheduledDoses.map(({ medicine, dose }) => {
        const status = getDoseDisplayStatus(dose.scheduledUtc, now, findDoseLog(doses, medicine.id, dose)?.status)
        const taken = status === 'taken'
        return <li key={dose.occurrenceKey} className="weekbook-row">
          <div className="min-w-0 flex-1 break-words"><strong>{medicine.name}</strong><p className="text-copy-muted">{medicine.dosage} · <time dateTime={dose.scheduledUtc.toISOString()}>{dose.timeOfDay}</time></p></div>
          <StatusBadge status={status} />
          <button type="button" disabled={pending} className={taken ? "weekbook-link app-focus" : "weekbook-action app-focus"} aria-label={taken ? `Undo taken dose of ${medicine.name} at ${dose.timeOfDay}` : `Mark ${medicine.name} at ${dose.timeOfDay} taken`} onClick={() => startTransition(async () => {
            setError('')
            try {
              await (taken ? undoDose : takeDose)(medicine.id, dose.scheduledUtc)
            } catch {
              setError('Unable to update the dose. Please try again.')
            }
          })}>{taken ? 'Undo' : 'Mark taken'}</button>
        </li>
      })}
    </ul> : <p className="mt-4 text-sm">No doses scheduled today.</p>}
    {error && <p role="alert" className="mt-4 text-sm">{error}</p>}
  </section>
}

function MedicinesView({ archivedMedications, filtered, takenIds, pendingDoseId, query, setQuery, setShowAdd, toggleDose, manage }: { archivedMedications: MedicationSummary[]; filtered: Medication[]; takenIds: Set<number>; pendingDoseId: number | null; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; manage: ManageMedication }) {
  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-3.5 text-copy-muted dark:text-[#9aa6b5]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search medications…"
          aria-label="Search medications"
          className="app-focus h-11 w-full rounded-xl border border-[#e3e8ee] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a5afbc] dark:border-[#48675a] dark:bg-[#1c3029] dark:text-[#ecf8f2]"
        />
      </div>
      {/* Full medication list */}
      <MedicationList
        filtered={filtered}
        takenIds={takenIds}
        pendingDoseId={pendingDoseId}
        setShowAdd={setShowAdd}
        toggleDose={toggleDose}
        manage={manage}
        title="Active medications"
        subtitle="Use Mark taken to log a dose."
      />
      <ArchivedMedications medications={archivedMedications} manage={manage} />
    </div>
  )
}

function StatusBadge({ status }: { status: DoseDisplayStatus | 'as-needed' }) {
  if (status === 'taken') return <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ef] px-2 py-0.5 text-[10px] font-bold text-[#246d4b] dark:bg-[#143c31] dark:text-[#8bd9ad]"><CheckCircle2 size={11} aria-hidden="true" /> Taken</span>
  if (status === 'as-needed') return <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf2f8] px-2 py-0.5 text-[10px] font-bold text-[#45637b] dark:bg-[#284739] dark:text-[#b4d0c5]"><Pill size={11} aria-hidden="true" /> As needed</span>
  if (status === 'missed' || status === 'overdue') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-200"><Clock3 size={11} aria-hidden="true" /> {status === 'missed' ? 'Missed' : 'Overdue'}</span>
  if (status === 'skipped') return <span className="text-xs font-semibold">Skipped</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e2] px-2 py-0.5 text-[10px] font-bold text-[#7b5217] dark:bg-[#3a2f19] dark:text-[#f0bd66]"><Clock3 size={11} aria-hidden="true" /> Upcoming</span>
}

function ArchivedMedications({ medications, manage }: { medications: MedicationSummary[]; manage: ManageMedication }) {
  return <details className="rounded-2xl border border-[#c4d7cf] bg-white p-4 dark:border-[#48675a] dark:bg-[#1c3029] sm:p-6">
    <summary className="app-focus cursor-pointer rounded-lg text-base font-bold">Archived medications ({medications.length})</summary>
    {medications.length ? <ul className="mt-4 space-y-2">
      {medications.map((medicine) => <li key={medicine.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d8e5df] p-3 dark:border-[#48675a]">
        <div className="min-w-0 break-words text-sm"><div className="font-semibold">{medicine.name}</div><div>{medicine.dosage}</div></div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => manage.request('restore', medicine)} className={managementButton} aria-label={`Restore ${medicine.name}`}>Restore</button>
          <button type="button" onClick={() => manage.request('delete', medicine)} className={destructiveManagementButton} aria-label={`Permanently delete ${medicine.name}`}>Delete permanently</button>
        </div>
      </li>)}
    </ul> : <p className="mt-4 text-sm">No archived medications.</p>}
  </details>
}

function MedicationActionDialog({ confirmation, pending, onClose, onConfirm }: { confirmation: MedicationConfirmation | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const action = confirmation?.action ?? 'archive'
  const spec = {
    archive: { label: 'Archive', description: 'This medication will leave your active care plan. Its existing history will remain available.' },
    restore: { label: 'Restore', description: 'This medication and its saved schedule will return to your active care plan.' },
    delete: { label: 'Delete', description: 'This permanently removes the medication, its schedules, reminders, and dose history.' },
  }[action]
  return <Dialog.Root open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[60] bg-[#15302b]/45 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl outline-none dark:bg-[#1c3029] sm:p-6">
          <Dialog.Title className="text-lg font-bold">{spec.label} {confirmation?.medicine.name}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-copy-muted dark:text-[#b4d0c5]">{spec.description}</Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close disabled={pending} className="app-focus min-h-11 rounded-lg border border-[#c4d7cf] px-4 text-sm font-bold dark:border-[#48675a]">Cancel</Dialog.Close>
            <button type="button" disabled={pending} onClick={onConfirm} className={`app-focus min-h-11 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60 ${action === 'delete' ? 'bg-[#a84f5a]' : 'bg-[#155b48]'}`}>{spec.label} medication</button>
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
}

function AppToast({ toast, pending, onUndo, onDismiss }: { toast: ToastMessage; pending: boolean; onUndo: (id: number) => void; onDismiss: () => void }) {
  return <div role={toast.kind === 'error' ? 'alert' : 'status'} aria-live={toast.kind === 'error' ? 'assertive' : 'polite'} className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-xl lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0 ${toast.kind === 'error' ? 'border-[#edc8cd] bg-[#fff7f7] text-[#8f3f49] dark:border-[#6b3540] dark:bg-[#3a1f2a] dark:text-[#f3b3bb]' : 'border-[#b9dfcb] bg-white text-[#275f46] dark:border-[#2c6b4b] dark:bg-[#143c31] dark:text-[#a8e3bf]'}`}>
    {toast.kind === 'success' ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : <X className="shrink-0" size={18} aria-hidden="true" />}
    <span className="min-w-0 flex-1 text-sm font-semibold">{toast.text}</span>
    {toast.undoMedicationId && <button type="button" disabled={pending} onClick={() => onUndo(toast.undoMedicationId!)} className="app-focus min-h-10 rounded-lg px-2 text-xs font-bold underline underline-offset-2 disabled:opacity-60">Undo</button>}
    <button type="button" onClick={onDismiss} className="app-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" aria-label="Dismiss message"><X size={16} aria-hidden="true" /></button>
  </div>
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section aria-labelledby={`settings-${title.toLowerCase().replaceAll(' ', '-')}`} className="rounded-2xl border border-[#c4d7cf] bg-white p-5 sm:p-6 dark:border-[#48675a] dark:bg-[#1c3029]">
    <h2 id={`settings-${title.toLowerCase().replaceAll(' ', '-')}`} className="text-base font-bold">{title}</h2>
    <p className="mt-1 text-xs leading-5 text-copy-muted dark:text-[#b4d0c5]">{description}</p>
    <div className="mt-5">{children}</div>
  </section>
}

function SettingsView({ user, settings, permissionMessage, vapidConfigured, hasActiveSubscription, onToggleReminders, onToggleTimezone, onEnableBrowser, onSignOut }: { user: { name: string; email: string }; settings: NotificationSettings; permissionMessage: string; vapidConfigured: boolean; hasActiveSubscription: boolean; onToggleReminders: (enabled: boolean) => void; onToggleTimezone: (tz: string) => void; onEnableBrowser: () => void; onSignOut: () => void }) {
  const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  const blocked = supported && Notification.permission === 'denied'
  const notificationState = !supported ? { label: 'Unsupported', text: "Push notifications aren't supported by this browser." }
    : blocked ? { label: 'Browser blocked', text: 'Notifications are blocked in your browser. Update this site’s permission in your browser settings.' }
    : hasActiveSubscription ? { label: 'Enabled', text: 'Notifications are enabled on this device.' }
    : !vapidConfigured ? { label: 'Temporarily unavailable', text: 'Notifications are temporarily unavailable on this device. Please try again later.' }
    : { label: 'Available', text: 'Notifications are available on this device.' }
  return (
    <div className="max-w-3xl space-y-5">
      <SettingsSection title="Reminders" description="Choose whether MediTrack creates reminders when a scheduled medication is due.">
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-[#d8e5df] p-4 dark:border-[#48675a]">
          <span>
            <span className="block text-sm font-bold">Enable reminders</span>
            <span className="text-xs text-copy-muted dark:text-[#b4d0c5]">Receive medication reminders based on your care plan.</span>
          </span>
          <input type="checkbox" checked={settings.medicationReminders} onChange={(e) => onToggleReminders(e.target.checked)} className="app-focus h-5 w-5 accent-[#155b48]" />
        </label>
      </SettingsSection>
      <SettingsSection title="Notifications" description="Manage background medication reminders for this browser and device.">
        <div className="rounded-xl border border-[#d8e5df] p-4 dark:border-[#48675a]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold"><Bell size={16} aria-hidden="true" /> {notificationState.label}</div>
              <p className="mt-1 text-xs leading-5 text-copy-muted dark:text-[#b4d0c5]">{notificationState.text}</p>
            </div>
            {!hasActiveSubscription && supported && !blocked && <button onClick={onEnableBrowser} disabled={!vapidConfigured} className="app-focus min-h-11 shrink-0 rounded-lg bg-[#155b48] px-4 text-xs font-bold text-white hover:bg-[#104b3b] disabled:cursor-not-allowed disabled:opacity-50">Enable notifications</button>}
          </div>
          {permissionMessage && <p role={permissionMessage.toLowerCase().includes('unable') ? 'alert' : 'status'} className="mt-3 text-xs font-semibold text-[#7b5217] dark:text-[#f0bd66]">{permissionMessage}</p>}
        </div>
      </SettingsSection>
      <SettingsSection title="Time & Region" description="Keep reminder times aligned with your current location.">
        <div className="flex flex-col gap-3 rounded-xl border border-[#d8e5df] p-4 dark:border-[#48675a] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-sm font-bold">Timezone</span>
            <span className="text-xs text-copy-muted dark:text-[#b4d0c5]">Reminders schedule relative to this timezone.</span>
          </div>
          <select aria-label="Timezone" value={settings.timezone || 'UTC'} onChange={(e) => onToggleTimezone(e.target.value)} className="app-focus h-11 w-full rounded-lg border border-[#c4d7cf] bg-white px-3 text-xs text-[#15302b] outline-none dark:border-[#48675a] dark:bg-[#284739] dark:text-[#ecf8f2] sm:w-auto">
            {settings.timezone && !supportedTimezones.includes(settings.timezone) && <option value={settings.timezone}>{settings.timezone}</option>}
            {supportedTimezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
          </select>
        </div>
      </SettingsSection>
      <AccountSettings user={user} />
      <button type="button" onClick={onSignOut} className="weekbook-link app-focus"><LogOut size={15} aria-hidden="true" /> Sign out</button>
      <SettingsSection title="Appearance" description="Choose the color theme that is most comfortable for you.">
        <div className="flex flex-col gap-3 rounded-xl border border-[#d8e5df] p-4 dark:border-[#48675a] sm:flex-row sm:items-center sm:justify-between">
          <div><span className="block text-sm font-bold">Color theme</span><span className="text-xs text-copy-muted dark:text-[#b4d0c5]">Use light, dark, or your system preference.</span></div>
          <div className="self-start sm:self-auto"><ThemeSelect /></div>
        </div>
      </SettingsSection>
    </div>
  )
}

function NotificationPanel({ status, notifications, onRead, onDismiss, onTake }: { status: NotificationStatus; notifications: NotificationRow[]; onRead: (id: number) => void; onDismiss: (id: number) => void; onTake: (id: number, medicationId: number | null) => void }) {
  return <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#0b1c28]/55 sm:bg-transparent" />
    <Dialog.Popup className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-xl border border-[#c4d7cf] bg-white shadow-xl outline-none sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[70px] sm:w-[360px] sm:max-w-[calc(100vw-2rem)] sm:max-h-[min(70vh,520px)] dark:border-[#48675a] dark:bg-[#1c3029]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#d8e5df] px-4 py-3 dark:border-[#48675a]">
        <Dialog.Title className="text-sm font-bold">Notifications</Dialog.Title>
        <Dialog.Close className="app-focus flex h-10 w-10 items-center justify-center rounded-lg text-copy-muted hover:bg-[#edf5f2] dark:text-[#b4d0c5] dark:hover:bg-[#284739]" aria-label="Close notifications"><X size={17} aria-hidden="true" /></Dialog.Close>
      </div>
      <Dialog.Description className="sr-only">Your medication reminders and notification actions.</Dialog.Description>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-3 [scrollbar-gutter:stable]" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' ? <p role="status" className="px-2 py-8 text-center text-xs text-copy-muted dark:text-[#b4d0c5]">Loading notifications…</p>
          : status === 'error' ? <p role="alert" className="px-2 py-8 text-center text-xs leading-5 text-[#98434e] dark:text-[#e2a2aa]">Notifications could not be loaded. Please close this panel and try again.</p>
          : notifications.length ? notifications.map((item) => <div key={item.id} className={`min-w-0 rounded-lg border p-3 ${item.read ? 'border-[#d8e5df] dark:border-[#48675a]' : 'border-[#9de6ca] bg-[#edf5f2] dark:bg-[#284739]'}`}><div className="flex min-w-0 items-start gap-2"><div className="min-w-0 break-words text-sm font-bold">{item.title}</div>{!item.read && <span className="sr-only">Unread</span>}</div><p className="mt-1 break-words text-xs leading-5 text-copy-muted dark:text-[#b4d0c5]">{item.message}</p><div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={() => onTake(item.id, item.medicationId)} disabled={!item.medicationId} className="app-focus min-h-10 rounded-lg bg-[#155b48] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Take now</button><button onClick={() => onRead(item.id)} className="app-focus min-h-10 rounded-lg border border-[#c4d7cf] px-3 py-2 text-xs font-bold dark:border-[#48675a]">Mark read</button><button onClick={() => onDismiss(item.id)} className="app-focus ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-copy-muted dark:text-[#9aa5b4] hover:bg-[#edf5f2] dark:hover:bg-[#284739]" aria-label={`Dismiss ${item.title}`}><X size={15} aria-hidden="true" /></button></div></div>)
          : <p className="px-2 py-8 text-center text-xs text-copy-muted dark:text-[#b4d0c5]">No reminders right now.</p>}
      </div>
    </Dialog.Popup>
  </Dialog.Portal>
}

function InstallButton({ installEvent, onDone }: { installEvent: Event | null; onDone: () => void }) {
  if (!installEvent) return null
  return <button onClick={async () => { await (installEvent as Event & { prompt?: () => Promise<void> }).prompt?.(); onDone() }} className="hidden h-10 items-center gap-1 rounded-lg border border-[#c4d7cf] px-3 text-xs font-bold sm:flex dark:border-[#48675a]" aria-label="Install MediTrack"><Download size={15} /> Install</button>
}

function MedicationForm({ medication, onClose, onSaved }: { medication: Medication | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(medication?.name ?? '')
  const [dosage, setDosage] = useState(medication?.dosage ?? '')
  const [asNeeded, setAsNeeded] = useState(medication?.frequency.toLowerCase().includes('needed') ?? false)
  const [schedule, setSchedule] = useState(() =>
    (medication?.scheduleTimes.length ? medication.scheduleTimes : ['08:00']).map((time, id) => ({ id, time })),
  )
  const nextDoseId = useRef(schedule.length)
  const fieldLabel = 'block min-w-0 flex-1 text-xs font-bold text-[#5f6e82] dark:text-[#b4d0c5]'
  const fieldClass = 'app-focus mt-2 h-11 w-full rounded-lg border border-[#c4d7cf] bg-white px-3 text-sm outline-none dark:border-[#48675a] dark:bg-[#284739]'

  function addDose() {
    const id = nextDoseId.current++
    setSchedule((items) => [...items, { id, time: '' }])
  }
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const fields = useFieldErrors()
  const nameError = fields.errorFor('name')
  const dosageError = fields.errorFor('dosage')
  const visibleSchedule = asNeeded ? schedule.slice(0, 1) : schedule

  function saveMedication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const seen = new Set<string>()
    const doseErrors: Record<string, string | undefined> = {}
    for (const { id, time } of visibleSchedule) {
      const { error, value } = validateTimeFormat(time)
      doseErrors[`dose-${id}`] = error ?? (seen.has(value) ? 'Choose a different time for this dose.' : undefined)
      seen.add(value)
    }
    if (!fields.validate(event.currentTarget, {
      name: validateMedicationName(name).error,
      dosage: validateDosage(dosage).error,
      ...doseErrors,
    })) return

    startTransition(async () => {
      try {
        const input = { name, dosage, frequency: asNeeded ? 'As needed' : 'Daily', scheduleTimes: visibleSchedule.map(({ time }) => time) }
        if (medication) await editMedication(medication.id, input)
        else await createMedication(input)
        onSaved()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to save medication.')
      }
    })
  }

  return <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[60] bg-[#15302b]/45 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[61] flex items-end justify-center sm:items-center sm:p-4">
        <Dialog.Popup initialFocus className="flex max-h-[100dvh] min-h-[100dvh] w-full max-w-md flex-col bg-white shadow-xl outline-none dark:bg-[#1c3029] sm:min-h-0 sm:max-h-[min(90dvh,720px)] sm:rounded-2xl">
          <form noValidate onSubmit={saveMedication} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b border-[#d8e5df] px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] dark:border-[#48675a] sm:p-6 sm:pb-4"><div><Dialog.Title className="text-lg font-bold">{medication ? 'Edit medication' : 'Add medication'}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-copy-muted dark:text-[#b4d0c5]">Keep your care plan up to date.</Dialog.Description></div><Dialog.Close className="app-focus flex h-11 w-11 items-center justify-center rounded-lg text-copy-muted dark:text-[#95a0af] hover:bg-[#edf5f2] dark:hover:bg-[#284739]" aria-label="Close medication form"><X size={18} aria-hidden="true" /></Dialog.Close></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {error && <p role="alert" className="mb-4 rounded-lg bg-[#fff2f2] px-3 py-2 text-xs font-semibold text-[#a84f5a] dark:bg-[#3a1f2a] dark:text-[#f3b3bb]">{error}</p>}
              <div className="space-y-4">
                <div>
                  <label className={fieldLabel}>Medication name
                    <input name="name" autoComplete="off" required value={name} onChange={(event) => setName(event.target.value)} {...fieldErrorAttributes(nameError)} className={fieldClass} placeholder="e.g. Lisinopril" />
                  </label>
                  <FieldErrorMessage error={nameError} />
                </div>
                <div>
                  <label className={fieldLabel}>Dosage
                    <input name="dosage" required value={dosage} onChange={(event) => setDosage(event.target.value)} {...fieldErrorAttributes(dosageError)} className={fieldClass} placeholder="10 mg" />
                  </label>
                  <FieldErrorMessage error={dosageError} />
                </div>
                <label className={fieldLabel}>Frequency
                  <select value={asNeeded ? 'as-needed' : 'daily'} onChange={(event) => setAsNeeded(event.target.value === 'as-needed')} className={fieldClass}>
                    <option value="daily">Daily</option>
                    <option value="as-needed">As needed</option>
                  </select>
                </label>
                {visibleSchedule.map((dose, index) => {
                  const fieldName = `dose-${dose.id}`
                  const doseError = fields.errorFor(fieldName)
                  return <div key={dose.id}>
                    <div className="flex items-end gap-2">
                      <label className={fieldLabel}>{asNeeded ? 'Due time' : `Dose ${index + 1} time`}
                        <input name={fieldName} type="time" required value={dose.time} onChange={(event) => setSchedule((items) => items.map((item) => item.id === dose.id ? { ...item, time: event.target.value } : item))} {...fieldErrorAttributes(doseError)} className={fieldClass} />
                      </label>
                      {!asNeeded && schedule.length > 1 && <button type="button" aria-label={`Remove dose ${index + 1}`} onClick={() => setSchedule((items) => items.filter((item) => item.id !== dose.id))} className="app-focus min-h-11 rounded-lg border px-3 text-xs font-bold">Remove</button>}
                    </div>
                    <FieldErrorMessage error={doseError} />
                  </div>
                })}
                {!asNeeded && schedule.length < 1440 && <button type="button" onClick={addDose} className="app-focus min-h-11 rounded-lg border px-3 text-xs font-bold">Add dose time</button>}
              </div>
            </div>
            <div className="border-t border-[#d8e5df] bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-[#48675a] dark:bg-[#1c3029] sm:rounded-b-2xl sm:px-6"><button disabled={pending} className="app-focus min-h-11 w-full rounded-lg bg-[#155b48] px-4 py-3 text-sm font-bold text-white hover:bg-[#104b3b] disabled:cursor-wait disabled:opacity-60">{pending ? 'Saving…' : 'Save medication'}</button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
}

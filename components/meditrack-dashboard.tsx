'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { archiveMedication, createMedication } from '@/app/actions/medications'
import { takeDose, undoDose } from '@/app/actions/doses'
import { dismissNotification, getNotificationState, markNotificationRead, savePushSubscription, updateNotificationSettings } from '@/app/actions/notifications'
import { ThemeSelect } from '@/components/theme-provider'
import { authClient } from '@/lib/auth-client'
import { calculateStreak } from '@/lib/adherence'
import { formatDateForTimeZone, getGreetingForTimeZone, type TimeOfDayGreeting } from '@/lib/timezone-display'
import { Activity, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, Download, FileText, LayoutDashboard, LogOut, Menu, MoreHorizontal, Pill, Plus, Search, Settings, ShieldCheck, TrendingUp, Undo2, X } from 'lucide-react'

type Medication = { id: number; name: string; dosage: string; frequency: string; instructions: string | null; color: string; active: boolean }
type Dose = { medicationId: number; status: string; scheduledAt: Date | string }
type NotificationRow = { id: number; medicationId: number | null; title: string; message: string; read: boolean; createdAt: Date | string }
type NotificationSettings = { medicationReminders: boolean; browserNotifications: boolean; timezone: string; reminderMinutesBefore: number }
type ToastMessage = { id: number; kind: 'success' | 'error'; text: string; undoMedicationId?: number }
type NotificationStatus = 'loading' | 'ready' | 'error'

const nav = [
  ['Dashboard', '/', LayoutDashboard],
  ['Medicines', '/medicines', Pill],
  ['Schedule', '/schedule', CalendarDays],
  ['History', '/history', FileText],
  ['Analytics', '/analytics', TrendingUp],
  ['Settings', '/settings', Settings],
] as const

export default function MediTrackDashboard({ medications, doses, user, initialTimezone, initialGreeting, initialLocalDate }: { medications: Medication[]; doses: Dose[]; user: { name: string; email: string }; initialTimezone: string | null; initialGreeting: TimeOfDayGreeting | null; initialLocalDate: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const activeLabel = nav.find((item) => item[1] === pathname)?.[0] ?? 'Dashboard'
  const [showAdd, setShowAdd] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [, startTransition] = useTransition()
  const [pendingDoseId, setPendingDoseId] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>('loading')
  const [settings, setSettings] = useState<NotificationSettings>({ medicationReminders: true, browserNotifications: false, reminderMinutesBefore: 0, timezone: initialTimezone ?? '' })
  const [greeting, setGreeting] = useState<TimeOfDayGreeting | null>(initialGreeting)
  const [localDate, setLocalDate] = useState<string | null>(initialLocalDate)
  const [permissionMessage, setPermissionMessage] = useState('')
  const [offline, setOffline] = useState(false)
  const [installEvent, setInstallEvent] = useState<Event | null>(null)

  const takenIds = useMemo(() => new Set(doses.filter((dose) => dose.status === 'taken').map((dose) => dose.medicationId)), [doses])
  const filtered = useMemo(() => medications.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())), [medications, query])
  const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const todayTaken = takenIds.size
  const unread = notifications.filter((item) => !item.read).length
  const streakMetrics = useMemo(() => calculateStreak(doses, new Date(), settings.timezone || 'UTC'), [doses, settings.timezone])

  const [vapidConfigured, setVapidConfigured] = useState(false)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)

  useEffect(() => {
    const updateLocalTime = () => {
      const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date()
      const configuredGreeting = getGreetingForTimeZone(settings.timezone, now)
      setGreeting(configuredGreeting ?? getGreetingForTimeZone(browserTimezone, now))
      setLocalDate(formatDateForTimeZone(settings.timezone, now) ?? formatDateForTimeZone(browserTimezone, now))
    }
    updateLocalTime()
    const interval = window.setInterval(updateLocalTime, 60_000)
    return () => window.clearInterval(interval)
  }, [settings.timezone])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    getNotificationState().then((state) => {
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
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallEvent(event) }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('beforeinstallprompt', beforeInstall) }
  }, [])

  async function toggleDose(id: number) {
    const medicine = medications.find((item) => item.id === id)
    const wasTaken = takenIds.has(id)
    setPendingDoseId(id)
    try {
      if (wasTaken) await undoDose(id)
      else await takeDose(id)
      setToast({ id: Date.now(), kind: 'success', text: wasTaken ? `${medicine?.name ?? 'Medication'} returned to scheduled.` : `${medicine?.name ?? 'Medication'} marked as taken.`, undoMedicationId: wasTaken ? undefined : id })
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
      await undoDose(id)
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
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(state.publicVapidKey) })
    await savePushSubscription(subscription.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } })
    await updateNotificationSettings({ ...settings, browserNotifications: true })
    setSettings((current) => ({ ...current, browserNotifications: true }))
    setHasActiveSubscription(true)
    setPermissionMessage('Browser notifications are enabled for this device.')
  }

  return <div className="min-h-screen bg-[#f6f8fb] text-[#18243a] dark:bg-[#0d2230] dark:text-[#f5eedd]">
    {offline && <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 bg-[#c58b35] px-4 py-2 text-center text-xs font-bold text-[#18243a]">You&apos;re offline. Medication changes need an active connection.</div>}
    <Sidebar medications={medications.length} activeLabel={activeLabel} user={user} initials={initials} />
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#0b1c28]/55 lg:hidden" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(284px,calc(100vw-2rem))] flex-col bg-white shadow-xl outline-none lg:hidden dark:bg-[#132b3b]">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Navigate to another MediTrack section.</Dialog.Description>
          <Dialog.Close className="app-focus absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-[#718096] hover:bg-[#f5f7fa] dark:text-[#b9d1df] dark:hover:bg-[#173247]" aria-label="Close navigation"><X size={18} aria-hidden="true" /></Dialog.Close>
          <SidebarContent medications={medications.length} activeLabel={activeLabel} user={user} initials={initials} onNavigate={() => setMobileOpen(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
    <main className="lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#e5eaf1] bg-white/95 px-4 backdrop-blur sm:px-8 dark:border-[#254258] dark:bg-[#132b3b]/95">
        <div className="flex min-w-0 items-center gap-3">
          <button className="app-focus flex h-11 w-11 items-center justify-center rounded-lg lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="min-w-0"><div className="truncate text-lg font-bold tracking-[-0.02em] sm:text-xl">{activeLabel === 'Dashboard' ? `${greeting ?? 'Welcome'}, ${user.name.split(' ')[0]}` : activeLabel} <span className="text-[#1e7b8c] dark:text-[#84B3CE]">.</span></div><div className="mt-1 hidden text-xs text-[#8592a5] sm:block dark:text-[#a8c4d3]">{localDate ?? 'Your local care plan'} <span className="mx-1.5 text-[#c3cad4]">·</span> Your care plan at a glance.</div></div>
        </div>
        <div className="flex items-center gap-2"><InstallButton installEvent={installEvent} onDone={() => setInstallEvent(null)} /><div className="hidden sm:block"><ThemeSelect compact /></div><Dialog.Root open={notificationOpen} onOpenChange={setNotificationOpen}><Dialog.Trigger className="app-focus relative flex h-11 w-11 items-center justify-center rounded-lg text-[#7d8a9d] hover:bg-[#f3f6f8] dark:text-[#bdd5df] dark:hover:bg-[#173247]" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}><Bell size={19} aria-hidden="true" />{unread > 0 && <span aria-hidden="true" className="absolute right-2 top-2 min-w-4 rounded-full bg-[#bd6570] px-1 text-[10px] font-bold text-white">{unread}</span>}</Dialog.Trigger><NotificationPanel status={notificationStatus} notifications={notifications} onRead={(id) => startTransition(async () => { await markNotificationRead(id); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)) })} onDismiss={(id) => startTransition(async () => { await dismissNotification(id); setNotifications((items) => items.filter((item) => item.id !== id)) })} onTake={(id, medicationId) => medicationId && startTransition(async () => { await takeDose(medicationId); await markNotificationRead(id); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)); router.refresh() })} /></Dialog.Root><div className="hidden h-7 w-px bg-[#e8ecf1] sm:block dark:bg-[#315069]" /><div className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#dbe9ee] text-xs font-bold text-[#256b79] sm:flex dark:bg-[#173247] dark:text-[#f5eedd]">{initials}</div><ChevronDown size={14} className="hidden text-[#8c98a9] sm:block" /></div>
      </header>
      <div className="mx-auto max-w-[1380px] p-4 pb-24 sm:p-8 lg:pb-8">
        {activeLabel === 'Settings' ? <SettingsView settings={settings} permissionMessage={permissionMessage} vapidConfigured={vapidConfigured} hasActiveSubscription={hasActiveSubscription} onToggleReminders={(enabled) => startTransition(async () => { await updateNotificationSettings({ ...settings, medicationReminders: enabled }); setSettings((current) => ({ ...current, medicationReminders: enabled })) })} onToggleTimezone={(tz) => startTransition(async () => { await updateNotificationSettings({ ...settings, timezone: tz }); setSettings((current) => ({ ...current, timezone: tz })) })} onEnableBrowser={enableBrowserNotifications} /> : <DashboardView activeLabel={activeLabel} medications={medications} filtered={filtered} takenIds={takenIds} todayTaken={todayTaken} streak={streakMetrics.currentStreak} pendingDoseId={pendingDoseId} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={(medicine) => startTransition(async () => { try { await archiveMedication(medicine.id); setToast({ id: Date.now(), kind: 'success', text: `${medicine.name} archived.` }); router.refresh() } catch { setToast({ id: Date.now(), kind: 'error', text: `Unable to archive ${medicine.name}. Please try again.` }) } })} />}
      </div>
    </main>
    <BottomNav activeLabel={activeLabel} onMore={() => setMobileOpen(true)} />
    <AddMedication open={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); setToast({ id: Date.now(), kind: 'success', text: 'Medication added successfully.' }); router.refresh() }} />
    {toast && <AppToast toast={toast} pending={pendingDoseId !== null} onUndo={undoToastDose} onDismiss={() => setToast(null)} />}
  </div>
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function Sidebar({ medications, activeLabel, user, initials }: { medications: number; activeLabel: string; user: { name: string; email: string }; initials: string }) {
  return <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-[#e5eaf1] bg-white lg:flex lg:flex-col dark:border-[#254258] dark:bg-[#132b3b]"><SidebarContent medications={medications} activeLabel={activeLabel} user={user} initials={initials} /></aside>
}

function SidebarContent({ medications, activeLabel, user, initials, onNavigate }: { medications: number; activeLabel: string; user: { name: string; email: string }; initials: string; onNavigate?: () => void }) {
  return <><div className="flex h-[112px] items-center px-5 border-b border-[#eef1f5] dark:border-[#254258]">
    <div className="h-[78px] w-full">
      <img
        src="/branding/meditrack-logo-reversed.png"
        alt="MediTrack"
        className="block dark:hidden h-full w-full object-contain object-left"
      />
      <img
        src="/branding/meditrack-logo-white.png"
        alt="MediTrack"
        className="hidden dark:block h-full w-full object-contain object-left"
      />
    </div>
  </div><div className="flex flex-1 flex-col px-4 py-7"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9aa6b7] dark:text-[#84B3CE]">Workspace</div><nav className="space-y-1">{nav.map(([label, href, Icon]) => <Link key={href} href={href} onClick={onNavigate} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#84B3CE] ${activeLabel === label ? 'bg-[#eaf6f6] text-[#146b7a] dark:bg-[#173247] dark:text-[#84B3CE]' : 'text-[#718096] hover:bg-[#f5f7fa] dark:text-[#b9d1df] dark:hover:bg-[#173247]'}`}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{label === 'Medicines' && <span className="ml-auto rounded-full bg-[#edf1f5] px-2 py-0.5 text-[10px] text-[#728097] dark:bg-[#0d2230] dark:text-[#b9d1df]">{medications}</span>}</Link>)}</nav><div className="mt-auto rounded-xl bg-[#f3f8f8] p-4 dark:bg-[#173247]"><div className="flex items-center gap-2 text-[#1f7988] dark:text-[#84B3CE]"><ShieldCheck size={17} /><span className="text-xs font-bold">Your data is private</span></div><p className="mt-2 text-[11px] leading-5 text-[#77909a] dark:text-[#b9d1df]">Private medication data is never cached by the service worker.</p></div></div><div className="flex items-center gap-3 border-t border-[#eef1f5] px-5 py-5 dark:border-[#254258]"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbe9ee] text-sm font-bold text-[#256b79] dark:bg-[#173247] dark:text-[#f5eedd]">{initials}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{user.name}</div><div className="truncate text-[11px] text-[#8b98aa] dark:text-[#a8c4d3]">{user.email}</div></div><button onClick={() => authClient.signOut().then(() => location.assign('/sign-in'))} className="rounded-lg p-2 text-[#9aa5b4] hover:bg-[#fff2f2] hover:text-[#b45e68]" aria-label="Sign out"><LogOut size={17} /></button></div></>
}

function BottomNav({ activeLabel, onMore }: { activeLabel: string; onMore: () => void }) {
  const primary = [
    ['Today', '/', LayoutDashboard],
    ['Medicines', '/medicines', Pill],
    ['Schedule', '/schedule', CalendarDays],
  ] as const
  const moreActive = ['History', 'Analytics', 'Settings'].includes(activeLabel)
  return <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#e5eaf1] bg-white/95 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-[#254258] dark:bg-[#132b3b]/95">{primary.map(([label, href, Icon]) => {
    const active = href === '/' ? activeLabel === 'Dashboard' : activeLabel === label
    return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`app-focus flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${active ? 'text-[#146b7a] dark:text-[#84B3CE]' : 'text-[#718096] dark:text-[#b9d1df]'}`}><Icon size={19} aria-hidden="true" /><span>{label}</span></Link>
  })}<button type="button" onClick={onMore} aria-label="Open more navigation options" className={`app-focus flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${moreActive ? 'text-[#146b7a] dark:text-[#84B3CE]' : 'text-[#718096] dark:text-[#b9d1df]'}`}><Menu size={19} aria-hidden="true" /><span>More</span></button></nav>
}

function DashboardView(props: { activeLabel: string; medications: Medication[]; filtered: Medication[]; takenIds: Set<number>; todayTaken: number; streak?: number; pendingDoseId: number | null; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void }) {
  const { activeLabel, medications, filtered, takenIds, todayTaken, streak = 0, pendingDoseId, query, setQuery, setShowAdd, toggleDose, archive } = props
  if (activeLabel === 'Medicines') return <MedicinesView medications={medications} filtered={filtered} takenIds={takenIds} pendingDoseId={pendingDoseId} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={archive} />
  if (activeLabel === 'Schedule') return <Placeholder title="Schedule" text="Scheduled doses are generated from medication times. Due reminders appear when their scheduled time arrives." />
  if (activeLabel === 'History') return <HistoryView doses={medications.map((medicine) => ({ medicine, taken: takenIds.has(medicine.id) }))} />
  if (activeLabel === 'Analytics') return <Placeholder title="Analytics" text="Adherence analytics will grow as more logged dose history is available." />
  // Default: Dashboard home
  return (
    <>
      <section className="grid gap-3 sm:gap-4 grid-cols-1 min-[480px]:grid-cols-3">
        <StatCard icon={<Check size={18} />} tone="green" label="Today's adherence" value={`${todayTaken} / ${medications.length}`} note={medications.length ? `${Math.round((todayTaken / medications.length) * 100)}% completed` : 'No medications yet'} />
        <StatCard icon={<Pill size={18} />} tone="blue" label="Active medications" value={String(medications.length)} note={medications.length ? 'Care plan is up to date' : 'Add your first medication'} />
        <StatCard icon={<Activity size={18} />} tone="orange" label="Current streak" value={streak > 0 ? `${streak} day${streak === 1 ? '' : 's'}` : '-'} note={streak > 0 ? 'Streak active' : 'Log doses to start a streak'} />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <MedicationList filtered={filtered} takenIds={takenIds} pendingDoseId={pendingDoseId} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={archive} />
        <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold">Adherence overview</h2>
              <p className="mt-1 text-xs text-[#8a96a8] dark:text-[#a8c4d3]">Live data will appear as you log doses.</p>
            </div>
            <TrendingUp size={18} className="text-[#1e7b8c] dark:text-[#84B3CE]" />
          </div>
          <div className="mt-8 rounded-xl bg-[#f3f8f8] p-5 dark:bg-[#173247]">
            <div className="text-3xl font-bold text-[#1d7c88] dark:text-[#84B3CE]">{medications.length ? `${Math.round((todayTaken / medications.length) * 100)}%` : '-'}</div>
            <p className="mt-1 text-xs text-[#718a95] dark:text-[#b9d1df]">Today&apos;s completion</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white dark:bg-[#0d2230]">
              <div className="h-full rounded-full bg-[#75c6c0]" style={{ width: `${medications.length ? (todayTaken / medications.length) * 100 : 0}%` }} />
            </div>
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-bold">Medication history</h2>
            <p className="mt-1 text-xs text-[#8a96a8] dark:text-[#a8c4d3]">A clear record of your recent doses.</p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-3 text-[#9aa6b5]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medication" className="h-10 w-full rounded-lg border border-[#e3e8ee] bg-[#fbfcfd] pl-9 pr-3 text-xs outline-none placeholder:text-[#a5afbc] focus:border-[#8ecbd0] sm:w-48 dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]" />
          </div>
        </div>
      </section>
    </>
  )
}

/** Shared medication card list used on both Dashboard and Medicines views. */
function MedicationList({ filtered, takenIds, pendingDoseId, setShowAdd, toggleDose, archive, title = "Today's medications", subtitle = "Your active prescriptions and today's dose status." }: { filtered: Medication[]; takenIds: Set<number>; pendingDoseId: number | null; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void; title?: string; subtitle?: string }) {
  const [archiveCandidate, setArchiveCandidate] = useState<Medication | null>(null)
  return (
    <section className="rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-1 text-xs text-[#8a96a8] dark:text-[#a8c4d3]">{subtitle}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="app-focus flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#1e7b8c] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#176b7a]" aria-label="Add medication">
          <Plus size={15} /> Add
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {filtered.length ? filtered.map((medicine) => {
          const isTaken = takenIds.has(medicine.id)
          return (
            <article key={medicine.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[#edf0f4] bg-white p-3.5 dark:border-[#315069] dark:bg-[#0f2635] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f4f6] text-[#237e8c] dark:bg-[#173247] dark:text-[#84B3CE]">
                <Pill size={19} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-bold sm:text-[15px]">{medicine.name}</h3>
                  <StatusBadge taken={isTaken} asNeeded={medicine.frequency.toLowerCase().includes('needed')} />
                </div>
                <div className="mt-1 text-sm font-semibold text-[#536479] dark:text-[#d4e2e8]">{medicine.dosage}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[#8491a3] dark:text-[#a8c4d3]">
                  <Clock3 size={13} aria-hidden="true" /> <span>{medicine.frequency} · {isTaken ? 'Completed today' : 'Scheduled today'}</span>
                </div>
              </div>
              <button
                disabled={pendingDoseId === medicine.id}
                aria-label={`${isTaken ? 'Undo' : 'Mark'} ${medicine.name} as taken`}
                onClick={() => toggleDose(medicine.id)}
                className={`app-focus col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-bold transition sm:col-span-1 ${isTaken ? 'border-[#b9dfcb] bg-[#eaf8f0] text-[#327f59] dark:border-[#2c6b4b] dark:bg-[#143c31] dark:text-[#8bd9ad]' : 'border-[#1e7b8c] bg-[#1e7b8c] text-white hover:bg-[#176b7a]'} disabled:cursor-wait disabled:opacity-60`}
              >
                {isTaken ? <Undo2 size={15} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                <span>{pendingDoseId === medicine.id ? 'Updating…' : isTaken ? 'Undo taken' : 'Mark taken'}</span>
              </button>
              <details className="relative self-center justify-self-end sm:row-auto">
                <summary className="app-focus flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-[#7d8a9d] hover:bg-[#f3f6f8] dark:text-[#bdd5df] dark:hover:bg-[#173247] [&::-webkit-details-marker]:hidden" aria-label={`More actions for ${medicine.name}`}><MoreHorizontal size={19} aria-hidden="true" /></summary>
                <div className="absolute bottom-12 right-0 z-20 w-40 rounded-lg border border-[#e5eaf1] bg-white p-1.5 shadow-lg dark:border-[#315069] dark:bg-[#173247]">
                  <button type="button" onClick={() => setArchiveCandidate(medicine)} className="app-focus flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-xs font-bold text-[#a34f5a] hover:bg-[#fff2f2] dark:text-[#e9a0a9] dark:hover:bg-[#3a1f2a]"><X size={15} aria-hidden="true" /> Archive</button>
                </div>
              </details>
            </article>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-[#dfe6ec] px-6 py-12 text-center dark:border-[#315069]">
            <Pill className="mx-auto text-[#a9b6c3]" size={28} />
            <p className="mt-3 text-sm font-bold">Your medication list is empty</p>
            <p className="mt-1 text-xs text-[#8794a5] dark:text-[#a8c4d3]">Add a prescription to begin tracking doses.</p>
            <button onClick={() => setShowAdd(true)} className="app-focus mt-4 min-h-11 rounded-lg bg-[#1e7b8c] px-4 py-2 text-xs font-bold text-white">Add medication</button>
          </div>
        )}
      </div>
      <ArchiveMedicationDialog medication={archiveCandidate} onClose={() => setArchiveCandidate(null)} onConfirm={() => { if (archiveCandidate) archive(archiveCandidate); setArchiveCandidate(null) }} />
    </section>
  )
}

/** Dedicated full-screen medicines management view (route: /medicines). */
function MedicinesView({ medications, filtered, takenIds, pendingDoseId, query, setQuery, setShowAdd, toggleDose, archive }: { medications: Medication[]; filtered: Medication[]; takenIds: Set<number>; pendingDoseId: number | null; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void }) {
  const todayTaken = useMemo(() => medications.filter((m) => takenIds.has(m.id)).length, [medications, takenIds])
  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e5eaf1] bg-white p-4 sm:p-5 dark:border-[#254258] dark:bg-[#132b3b]">
        <div className="flex flex-1 flex-wrap gap-5 min-w-0">
          <div>
            <div className="text-xs font-semibold text-[#8793a5] dark:text-[#a8c4d3]">Active</div>
            <div className="mt-0.5 text-2xl font-bold tracking-tight">{medications.length}</div>
          </div>
          <div className="h-auto w-px bg-[#e8ecf1] dark:bg-[#315069]" />
          <div>
            <div className="text-xs font-semibold text-[#8793a5] dark:text-[#a8c4d3]">Taken today</div>
            <div className="mt-0.5 text-2xl font-bold tracking-tight text-[#31835c] dark:text-[#8bd9ad]">{todayTaken}</div>
          </div>
          <div className="h-auto w-px bg-[#e8ecf1] dark:bg-[#315069]" />
          <div>
            <div className="text-xs font-semibold text-[#8793a5] dark:text-[#a8c4d3]">Remaining</div>
            <div className="mt-0.5 text-2xl font-bold tracking-tight text-[#c58b35] dark:text-[#f0bd66]">{medications.length - todayTaken}</div>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="app-focus flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#1e7b8c] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#176b7a]"
          aria-label="Add new medication"
        >
          <Plus size={16} /> Add medication
        </button>
      </div>
      {/* Search bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-3.5 text-[#9aa6b5]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search medications…"
          aria-label="Search medications"
          className="app-focus h-11 w-full rounded-xl border border-[#e3e8ee] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a5afbc] dark:border-[#315069] dark:bg-[#132b3b] dark:text-[#f5eedd]"
        />
      </div>
      {/* Full medication list */}
      <MedicationList
        filtered={filtered}
        takenIds={takenIds}
        pendingDoseId={pendingDoseId}
        setShowAdd={setShowAdd}
        toggleDose={toggleDose}
        archive={archive}
        title="All medications"
        subtitle="Manage your care plan. Tap the check to log or undo a dose."
      />
    </div>
  )
}

function StatusBadge({ taken, asNeeded }: { taken: boolean; asNeeded: boolean }) {
  if (taken) return <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6ef] px-2 py-0.5 text-[10px] font-bold text-[#31835c] dark:bg-[#143c31] dark:text-[#8bd9ad]"><CheckCircle2 size={11} aria-hidden="true" /> Taken</span>
  if (asNeeded) return <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf2f8] px-2 py-0.5 text-[10px] font-bold text-[#557790] dark:bg-[#173247] dark:text-[#b9d1df]"><Pill size={11} aria-hidden="true" /> As needed</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e2] px-2 py-0.5 text-[10px] font-bold text-[#9c681c] dark:bg-[#3a2f19] dark:text-[#f0bd66]"><Clock3 size={11} aria-hidden="true" /> Upcoming</span>
}

function ArchiveMedicationDialog({ medication, onClose, onConfirm }: { medication: Medication | null; onClose: () => void; onConfirm: () => void }) {
  return <Dialog.Root open={Boolean(medication)} onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[60] bg-[#18243a]/45 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl outline-none dark:bg-[#132b3b] sm:p-6">
          <Dialog.Title className="text-lg font-bold">Archive {medication?.name}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-[#718096] dark:text-[#b9d1df]">This medication will leave your active care plan. Its existing history will remain available.</Dialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close className="app-focus min-h-11 rounded-lg border border-[#dfe6ec] px-4 text-sm font-bold dark:border-[#315069]">Keep medication</Dialog.Close>
            <button type="button" onClick={onConfirm} className="app-focus min-h-11 rounded-lg bg-[#a84f5a] px-4 text-sm font-bold text-white hover:bg-[#934550]">Archive medication</button>
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
}

function AppToast({ toast, pending, onUndo, onDismiss }: { toast: ToastMessage; pending: boolean; onUndo: (id: number) => void; onDismiss: () => void }) {
  return <div role={toast.kind === 'error' ? 'alert' : 'status'} aria-live={toast.kind === 'error' ? 'assertive' : 'polite'} className={`fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-xl lg:bottom-6 lg:left-auto lg:right-6 lg:translate-x-0 ${toast.kind === 'error' ? 'border-[#edc8cd] bg-[#fff7f7] text-[#8f3f49] dark:border-[#6b3540] dark:bg-[#3a1f2a] dark:text-[#f3b3bb]' : 'border-[#b9dfcb] bg-white text-[#275f46] dark:border-[#2c6b4b] dark:bg-[#143c31] dark:text-[#a8e3bf]'}`}>
    {toast.kind === 'success' ? <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" /> : <X className="shrink-0" size={18} aria-hidden="true" />}
    <span className="min-w-0 flex-1 text-sm font-semibold">{toast.text}</span>
    {toast.undoMedicationId && <button type="button" disabled={pending} onClick={() => onUndo(toast.undoMedicationId!)} className="app-focus min-h-10 rounded-lg px-2 text-xs font-bold underline underline-offset-2 disabled:opacity-60">Undo</button>}
    <button type="button" onClick={onDismiss} className="app-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" aria-label="Dismiss message"><X size={16} aria-hidden="true" /></button>
  </div>
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section aria-labelledby={`settings-${title.toLowerCase().replaceAll(' ', '-')}`} className="rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
    <h2 id={`settings-${title.toLowerCase().replaceAll(' ', '-')}`} className="text-base font-bold">{title}</h2>
    <p className="mt-1 text-xs leading-5 text-[#8a96a8] dark:text-[#a8c4d3]">{description}</p>
    <div className="mt-5">{children}</div>
  </section>
}

function SettingsView({ settings, permissionMessage, vapidConfigured, hasActiveSubscription, onToggleReminders, onToggleTimezone, onEnableBrowser }: { settings: NotificationSettings; permissionMessage: string; vapidConfigured: boolean; hasActiveSubscription: boolean; onToggleReminders: (enabled: boolean) => void; onToggleTimezone: (tz: string) => void; onEnableBrowser: () => void }) {
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
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <span>
            <span className="block text-sm font-bold">Enable reminders</span>
            <span className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">Receive medication reminders based on your care plan.</span>
          </span>
          <input type="checkbox" checked={settings.medicationReminders} onChange={(e) => onToggleReminders(e.target.checked)} className="app-focus h-5 w-5 accent-[#1e7b8c]" />
        </label>
      </SettingsSection>
      <SettingsSection title="Notifications" description="Manage background medication reminders for this browser and device.">
        <div className="rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold"><Bell size={16} aria-hidden="true" /> {notificationState.label}</div>
              <p className="mt-1 text-xs leading-5 text-[#8491a3] dark:text-[#a8c4d3]">{notificationState.text}</p>
            </div>
            {!hasActiveSubscription && supported && !blocked && <button onClick={onEnableBrowser} disabled={!vapidConfigured} className="app-focus min-h-11 shrink-0 rounded-lg bg-[#1e7b8c] px-4 text-xs font-bold text-white hover:bg-[#176b7a] disabled:cursor-not-allowed disabled:opacity-50">Enable notifications</button>}
          </div>
          {permissionMessage && <p role={permissionMessage.toLowerCase().includes('unable') ? 'alert' : 'status'} className="mt-3 text-xs font-semibold text-[#9c681c] dark:text-[#f0bd66]">{permissionMessage}</p>}
        </div>
      </SettingsSection>
      <SettingsSection title="Time & Region" description="Keep reminder times aligned with your current location.">
        <div className="flex flex-col gap-3 rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069] sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="block text-sm font-bold">Timezone</span>
            <span className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">Reminders schedule relative to this timezone.</span>
          </div>
          <select aria-label="Timezone" value={settings.timezone} onChange={(e) => onToggleTimezone(e.target.value)} className="app-focus h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-xs text-[#18243a] outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd] sm:w-auto">
            <option value="UTC">UTC</option>
            <option value="Asia/Manila">Asia/Manila (PHT)</option>
            <option value="America/New_York">America/New_York (EST/EDT)</option>
            <option value="America/Chicago">America/Chicago (CST/CDT)</option>
            <option value="America/Denver">America/Denver (MST/MDT)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            <option value="Europe/London">Europe/London (GMT/BST)</option>
            <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
          </select>
        </div>
      </SettingsSection>
      <SettingsSection title="Appearance" description="Choose the color theme that is most comfortable for you.">
        <div className="flex flex-col gap-3 rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069] sm:flex-row sm:items-center sm:justify-between">
          <div><span className="block text-sm font-bold">Color theme</span><span className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">Use light, dark, or your system preference.</span></div>
          <div className="self-start sm:self-auto"><ThemeSelect /></div>
        </div>
      </SettingsSection>
    </div>
  )
}

function NotificationPanel({ status, notifications, onRead, onDismiss, onTake }: { status: NotificationStatus; notifications: NotificationRow[]; onRead: (id: number) => void; onDismiss: (id: number) => void; onTake: (id: number, medicationId: number | null) => void }) {
  return <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#0b1c28]/55 sm:bg-transparent" />
    <Dialog.Popup className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 flex max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-xl border border-[#e5eaf1] bg-white shadow-xl outline-none sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[70px] sm:w-[360px] sm:max-w-[calc(100vw-2rem)] sm:max-h-[min(70vh,520px)] dark:border-[#254258] dark:bg-[#132b3b]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#edf0f4] px-4 py-3 dark:border-[#254258]">
        <Dialog.Title className="text-sm font-bold">Notifications</Dialog.Title>
        <Dialog.Close className="app-focus flex h-10 w-10 items-center justify-center rounded-lg text-[#718096] hover:bg-[#f3f6f8] dark:text-[#b9d1df] dark:hover:bg-[#173247]" aria-label="Close notifications"><X size={17} aria-hidden="true" /></Dialog.Close>
      </div>
      <Dialog.Description className="sr-only">Your medication reminders and notification actions.</Dialog.Description>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-3 [scrollbar-gutter:stable]" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' ? <p role="status" className="px-2 py-8 text-center text-xs text-[#718096] dark:text-[#b9d1df]">Loading notifications…</p>
          : status === 'error' ? <p role="alert" className="px-2 py-8 text-center text-xs leading-5 text-[#b45e68] dark:text-[#e2a2aa]">Notifications could not be loaded. Please close this panel and try again.</p>
          : notifications.length ? notifications.map((item) => <div key={item.id} className={`min-w-0 rounded-lg border p-3 ${item.read ? 'border-[#edf0f4] dark:border-[#315069]' : 'border-[#84B3CE] bg-[#f3f8f8] dark:bg-[#173247]'}`}><div className="flex min-w-0 items-start gap-2"><div className="min-w-0 break-words text-sm font-bold">{item.title}</div>{!item.read && <span className="sr-only">Unread</span>}</div><p className="mt-1 break-words text-xs leading-5 text-[#718096] dark:text-[#b9d1df]">{item.message}</p><div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={() => onTake(item.id, item.medicationId)} disabled={!item.medicationId} className="app-focus min-h-10 rounded-lg bg-[#1e7b8c] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Take now</button><button onClick={() => onRead(item.id)} className="app-focus min-h-10 rounded-lg border border-[#dfe6ec] px-3 py-2 text-xs font-bold dark:border-[#315069]">Mark read</button><button onClick={() => onDismiss(item.id)} className="app-focus ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#9aa5b4] hover:bg-[#f3f6f8] dark:hover:bg-[#173247]" aria-label={`Dismiss ${item.title}`}><X size={15} aria-hidden="true" /></button></div></div>)
          : <p className="px-2 py-8 text-center text-xs text-[#718096] dark:text-[#b9d1df]">No reminders right now.</p>}
      </div>
    </Dialog.Popup>
  </Dialog.Portal>
}

function InstallButton({ installEvent, onDone }: { installEvent: Event | null; onDone: () => void }) {
  if (!installEvent) return null
  return <button onClick={async () => { await (installEvent as Event & { prompt?: () => Promise<void> }).prompt?.(); onDone() }} className="hidden h-10 items-center gap-1 rounded-lg border border-[#dfe6ec] px-3 text-xs font-bold sm:flex dark:border-[#315069]" aria-label="Install MediTrack"><Download size={15} /> Install</button>
}

function HistoryView({ doses }: { doses: { medicine: Medication; taken: boolean }[] }) {
  return <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 dark:border-[#254258] dark:bg-[#132b3b]"><h2 className="text-base font-bold">Medication history</h2><div className="mt-4 space-y-2">{doses.map(({ medicine, taken }) => <div key={medicine.id} className="flex items-center justify-between rounded-lg border border-[#edf0f4] p-3 text-sm dark:border-[#315069]"><span>{medicine.name}</span><span className={taken ? 'text-[#31835c]' : 'text-[#c58b35]'}>{taken ? 'Taken today' : 'Scheduled'}</span></div>)}</div></section>
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="rounded-2xl border border-[#e5eaf1] bg-white p-8 dark:border-[#254258] dark:bg-[#132b3b]"><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 max-w-xl text-sm text-[#718096] dark:text-[#b9d1df]">{text}</p></section>
}

function AddMedication({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('Once daily')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  return <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[60] bg-[#18243a]/45 backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 z-[61] flex items-end justify-center sm:items-center sm:p-4">
        <Dialog.Popup initialFocus className="flex max-h-[100dvh] min-h-[100dvh] w-full max-w-md flex-col bg-white shadow-xl outline-none dark:bg-[#132b3b] sm:min-h-0 sm:max-h-[min(90dvh,720px)] sm:rounded-2xl">
          <form onSubmit={(event) => { event.preventDefault(); startTransition(async () => { try { await createMedication({ name, dosage, frequency, timeOfDay }); onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save medication.') } }) }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b border-[#edf0f4] px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] dark:border-[#315069] sm:p-6 sm:pb-4"><div><Dialog.Title className="text-lg font-bold">Add medication</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[#8794a5] dark:text-[#a8c4d3]">Keep your care plan up to date.</Dialog.Description></div><Dialog.Close className="app-focus flex h-11 w-11 items-center justify-center rounded-lg text-[#95a0af] hover:bg-[#f3f6f8] dark:hover:bg-[#173247]" aria-label="Close add medication dialog"><X size={18} aria-hidden="true" /></Dialog.Close></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {error && <p role="alert" className="mb-4 rounded-lg bg-[#fff2f2] px-3 py-2 text-xs font-semibold text-[#a84f5a] dark:bg-[#3a1f2a] dark:text-[#f3b3bb]">{error}</p>}
              <div className="space-y-4"><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Medication name<input autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none dark:border-[#315069] dark:bg-[#173247]" placeholder="e.g. Lisinopril" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Dosage<input required value={dosage} onChange={(e) => setDosage(e.target.value)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none dark:border-[#315069] dark:bg-[#173247]" placeholder="10 mg" /></label><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Due time<input type="time" required value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none dark:border-[#315069] dark:bg-[#173247]" /></label></div><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Frequency<select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="app-focus mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none dark:border-[#315069] dark:bg-[#173247]"><option>Once daily</option><option>Twice daily</option><option>As needed</option></select></label></div>
            </div>
            <div className="border-t border-[#edf0f4] bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-[#315069] dark:bg-[#132b3b] sm:rounded-b-2xl sm:px-6"><button disabled={pending} className="app-focus min-h-11 w-full rounded-lg bg-[#1e7b8c] px-4 py-3 text-sm font-bold text-white hover:bg-[#176b7a] disabled:cursor-wait disabled:opacity-60">{pending ? 'Saving…' : 'Save medication'}</button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>
}

function StatCard({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  const tones: Record<string, string> = { green: 'bg-[#e8f7ef] text-[#3a956a] dark:bg-[#143c31] dark:text-[#8bd9ad]', blue: 'bg-[#e5f4f6] text-[#237e8c] dark:bg-[#173247] dark:text-[#84B3CE]', orange: 'bg-[#fff3e2] text-[#c58b35] dark:bg-[#3a2f19] dark:text-[#f0bd66]' }
  return <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)] dark:border-[#254258] dark:bg-[#132b3b]"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><div className="min-w-0"><div className="text-xs font-semibold text-[#8793a5] dark:text-[#a8c4d3]">{label}</div><div className="mt-0.5 flex flex-wrap items-baseline gap-2"><span className="text-xl font-bold tracking-tight">{value}</span><span className="text-[10px] font-semibold text-[#8a97a8] dark:text-[#b9d1df]">{note}</span></div></div></div>
}

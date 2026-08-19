'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { archiveMedication, createMedication } from '@/app/actions/medications'
import { takeDose, undoDose } from '@/app/actions/doses'
import { dismissNotification, getNotificationState, markNotificationRead, savePushSubscription, updateNotificationSettings } from '@/app/actions/notifications'
import { ThemeSelect } from '@/components/theme-provider'
import { authClient } from '@/lib/auth-client'
import { Activity, Bell, CalendarDays, Check, ChevronDown, Clock3, Download, FileText, HeartPulse, LayoutDashboard, LogOut, Menu, Pill, Plus, Search, Settings, ShieldCheck, TrendingUp, X } from 'lucide-react'

type Medication = { id: number; name: string; dosage: string; frequency: string; instructions: string | null; color: string; active: boolean }
type Dose = { medicationId: number; status: string; scheduledAt: Date | string }
type NotificationRow = { id: number; medicationId: number | null; title: string; message: string; read: boolean; createdAt: Date | string }
type NotificationSettings = { medicationReminders: boolean; browserNotifications: boolean; timezone: string; reminderMinutesBefore: number }

const nav = [
  ['Dashboard', '/', LayoutDashboard],
  ['Medicines', '/medicines', Pill],
  ['Schedule', '/schedule', CalendarDays],
  ['History', '/history', FileText],
  ['Analytics', '/analytics', TrendingUp],
  ['Settings', '/settings', Settings],
] as const

export default function MediTrackDashboard({ medications, doses, user }: { medications: Medication[]; doses: Dose[]; user: { name: string; email: string } }) {
  const pathname = usePathname()
  const router = useRouter()
  const activeLabel = nav.find((item) => item[1] === pathname)?.[0] ?? 'Dashboard'
  const [showAdd, setShowAdd] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [settings, setSettings] = useState<NotificationSettings>({ medicationReminders: true, browserNotifications: false, reminderMinutesBefore: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
  const [permissionMessage, setPermissionMessage] = useState('')
  const [offline, setOffline] = useState(false)
  const [installEvent, setInstallEvent] = useState<Event | null>(null)

  const takenIds = useMemo(() => new Set(doses.filter((dose) => dose.status === 'taken').map((dose) => dose.medicationId)), [doses])
  const filtered = useMemo(() => medications.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())), [medications, query])
  const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const todayTaken = takenIds.size
  const unread = notifications.filter((item) => !item.read).length

  const [vapidConfigured, setVapidConfigured] = useState(false)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)

  useEffect(() => {
    getNotificationState().then((state) => {
      setNotifications(state.notifications)
      setSettings({ medicationReminders: state.settings.medicationReminders, browserNotifications: state.settings.browserNotifications, reminderMinutesBefore: state.settings.reminderMinutesBefore, timezone: state.settings.timezone })
      setVapidConfigured(state.vapidConfigured)
      setHasActiveSubscription(state.hasActiveSubscription)
    }).catch(() => undefined)
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

  useEffect(() => {
    if (!mobileOpen) return
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey) }
  }, [mobileOpen])

  function toggleDose(id: number) {
    startTransition(async () => {
      try {
        if (takenIds.has(id)) await undoDose(id)
        else await takeDose(id)
        setMessage(takenIds.has(id) ? 'Dose marked as scheduled.' : 'Dose logged successfully.')
        router.refresh()
      } catch {
        setMessage('Unable to update this dose. Please try again.')
      }
    })
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
      setPermissionMessage('Browser push needs VAPID keys fully configured on the server before sending reminders.')
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
    {offline && <div className="fixed inset-x-0 top-0 z-50 bg-[#c58b35] px-4 py-2 text-center text-xs font-bold text-[#18243a]">You&apos;re offline. Medication changes need an active connection.</div>}
    <Sidebar medications={medications.length} activeLabel={activeLabel} user={user} initials={initials} />
    {mobileOpen && <div className="fixed inset-0 z-40 bg-[#0b1c28]/55 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <div className={`fixed inset-y-0 left-0 z-50 w-[284px] bg-white shadow-xl transition lg:hidden dark:bg-[#132b3b] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 text-[#718096] hover:bg-[#f5f7fa] dark:text-[#b9d1df] dark:hover:bg-[#173247]" aria-label="Close navigation"><X size={18} /></button>
      <SidebarContent medications={medications.length} activeLabel={activeLabel} user={user} initials={initials} onNavigate={() => setMobileOpen(false)} />
    </div>
    <main className="lg:pl-[248px]">
      <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between border-b border-[#e5eaf1] bg-white/95 px-4 backdrop-blur sm:px-8 dark:border-[#254258] dark:bg-[#132b3b]/95">
        <div className="flex min-w-0 items-center gap-3">
          <button className="flex h-11 w-11 items-center justify-center rounded-lg lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="min-w-0"><div className="truncate text-lg font-bold tracking-[-0.02em] sm:text-xl">{activeLabel === 'Dashboard' ? `Good morning, ${user.name.split(' ')[0]}` : activeLabel} <span className="text-[#1e7b8c] dark:text-[#84B3CE]">.</span></div><div className="mt-1 hidden text-xs text-[#8592a5] sm:block dark:text-[#a8c4d3]">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())} <span className="mx-1.5 text-[#c3cad4]">·</span> Your care plan at a glance.</div></div>
        </div>
        <div className="flex items-center gap-2"><InstallButton installEvent={installEvent} onDone={() => setInstallEvent(null)} /><div className="hidden sm:block"><ThemeSelect compact /></div><button onClick={() => setNotificationOpen((value) => !value)} className="relative flex h-11 w-11 items-center justify-center rounded-lg text-[#7d8a9d] hover:bg-[#f3f6f8] dark:text-[#bdd5df] dark:hover:bg-[#173247]" aria-label="Open notifications"><Bell size={19} />{unread > 0 && <span className="absolute right-2 top-2 min-w-4 rounded-full bg-[#bd6570] px-1 text-[10px] font-bold text-white">{unread}</span>}</button><div className="hidden h-7 w-px bg-[#e8ecf1] sm:block dark:bg-[#315069]" /><div className="hidden h-8 w-8 items-center justify-center rounded-full bg-[#dbe9ee] text-xs font-bold text-[#256b79] sm:flex dark:bg-[#173247] dark:text-[#f5eedd]">{initials}</div><ChevronDown size={14} className="hidden text-[#8c98a9] sm:block" /></div>
        {notificationOpen && <NotificationPanel notifications={notifications} onRead={(id) => startTransition(async () => { await markNotificationRead(id); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)) })} onDismiss={(id) => startTransition(async () => { await dismissNotification(id); setNotifications((items) => items.filter((item) => item.id !== id)) })} onTake={(id, medicationId) => medicationId && startTransition(async () => { await takeDose(medicationId); await markNotificationRead(id); setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item)); router.refresh() })} />}
      </header>
      <div className="mx-auto max-w-[1380px] p-4 pb-24 sm:p-8 lg:pb-8">
        {activeLabel === 'Settings' ? <SettingsView settings={settings} permissionMessage={permissionMessage} vapidConfigured={vapidConfigured} hasActiveSubscription={hasActiveSubscription} onToggleReminders={(enabled) => startTransition(async () => { await updateNotificationSettings({ ...settings, medicationReminders: enabled }); setSettings((current) => ({ ...current, medicationReminders: enabled })) })} onToggleTimezone={(tz) => startTransition(async () => { await updateNotificationSettings({ ...settings, timezone: tz }); setSettings((current) => ({ ...current, timezone: tz })) })} onEnableBrowser={enableBrowserNotifications} /> : <DashboardView activeLabel={activeLabel} medications={medications} filtered={filtered} takenIds={takenIds} todayTaken={todayTaken} isPending={isPending} message={message} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={(medicine) => startTransition(async () => { await archiveMedication(medicine.id); setMessage(`${medicine.name} archived.`); router.refresh() })} />}
      </div>
    </main>
    <BottomNav activeLabel={activeLabel} />
    {showAdd && <AddMedication onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); setMessage('Medication added successfully.'); router.refresh() }} />}
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
  return <><div className="flex h-[120px] items-center px-5 border-b border-[#eef1f5] dark:border-[#254258]">
    <div className="relative h-[80px] w-full">
      <img
        src="/branding/meditrack-logo-white.png"
        alt="MediTrack"
        className="block dark:hidden h-full w-auto object-contain object-left"
      />
      <img
        src="/branding/meditrack-logo-reversed.png"
        alt="MediTrack"
        className="hidden dark:block h-full w-auto object-contain object-left"
      />
    </div>
  </div><div className="flex flex-1 flex-col px-4 py-7"><div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9aa6b7] dark:text-[#84B3CE]">Workspace</div><nav className="space-y-1">{nav.map(([label, href, Icon]) => <Link key={href} href={href} onClick={onNavigate} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#84B3CE] ${activeLabel === label ? 'bg-[#eaf6f6] text-[#146b7a] dark:bg-[#173247] dark:text-[#84B3CE]' : 'text-[#718096] hover:bg-[#f5f7fa] dark:text-[#b9d1df] dark:hover:bg-[#173247]'}`}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{label === 'Medicines' && <span className="ml-auto rounded-full bg-[#edf1f5] px-2 py-0.5 text-[10px] text-[#728097] dark:bg-[#0d2230] dark:text-[#b9d1df]">{medications}</span>}</Link>)}</nav><div className="mt-auto rounded-xl bg-[#f3f8f8] p-4 dark:bg-[#173247]"><div className="flex items-center gap-2 text-[#1f7988] dark:text-[#84B3CE]"><ShieldCheck size={17} /><span className="text-xs font-bold">Your data is private</span></div><p className="mt-2 text-[11px] leading-5 text-[#77909a] dark:text-[#b9d1df]">Private medication data is never cached by the service worker.</p></div></div><div className="flex items-center gap-3 border-t border-[#eef1f5] px-5 py-5 dark:border-[#254258]"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbe9ee] text-sm font-bold text-[#256b79] dark:bg-[#173247] dark:text-[#f5eedd]">{initials}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{user.name}</div><div className="truncate text-[11px] text-[#8b98aa] dark:text-[#a8c4d3]">{user.email}</div></div><button onClick={() => authClient.signOut().then(() => location.assign('/sign-in'))} className="rounded-lg p-2 text-[#9aa5b4] hover:bg-[#fff2f2] hover:text-[#b45e68]" aria-label="Sign out"><LogOut size={17} /></button></div></>
}

function BottomNav({ activeLabel }: { activeLabel: string }) {
  return <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[#e5eaf1] bg-white/95 px-1 py-1 backdrop-blur lg:hidden dark:border-[#254258] dark:bg-[#132b3b]/95">{nav.map(([label, href, Icon]) => <Link key={href} href={href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${activeLabel === label ? 'text-[#146b7a] dark:text-[#84B3CE]' : 'text-[#718096] dark:text-[#b9d1df]'}`}><Icon size={18} /><span className="max-[360px]:sr-only">{label === 'Medicines' ? 'Meds' : label}</span></Link>)}</nav>
}

function DashboardView(props: { activeLabel: string; medications: Medication[]; filtered: Medication[]; takenIds: Set<number>; todayTaken: number; isPending: boolean; message: string; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void }) {
  const { activeLabel, medications, filtered, takenIds, todayTaken, isPending, message, query, setQuery, setShowAdd, toggleDose, archive } = props
  if (activeLabel === 'Medicines') return <MedicinesView medications={medications} filtered={filtered} takenIds={takenIds} isPending={isPending} message={message} query={query} setQuery={setQuery} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={archive} />
  if (activeLabel === 'Schedule') return <Placeholder title="Schedule" text="Scheduled doses are generated from medication times. Due reminders appear when their scheduled time arrives." />
  if (activeLabel === 'History') return <HistoryView doses={medications.map((medicine) => ({ medicine, taken: takenIds.has(medicine.id) }))} />
  if (activeLabel === 'Analytics') return <Placeholder title="Analytics" text="Adherence analytics will grow as more logged dose history is available." />
  // Default: Dashboard home
  return (
    <>
      <section className="grid gap-3 sm:gap-4 grid-cols-1 min-[480px]:grid-cols-3">
        <StatCard icon={<Check size={18} />} tone="green" label="Today's adherence" value={`${todayTaken} / ${medications.length}`} note={medications.length ? `${Math.round((todayTaken / medications.length) * 100)}% completed` : 'No medications yet'} />
        <StatCard icon={<Pill size={18} />} tone="blue" label="Active medications" value={String(medications.length)} note={medications.length ? 'Care plan is up to date' : 'Add your first medication'} />
        <StatCard icon={<Activity size={18} />} tone="orange" label="Current streak" value="-" note="Log doses to start a streak" />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <MedicationList filtered={filtered} takenIds={takenIds} isPending={isPending} message={message} setShowAdd={setShowAdd} toggleDose={toggleDose} archive={archive} />
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
function MedicationList({ filtered, takenIds, isPending, message, setShowAdd, toggleDose, archive, title = "Today's medications", subtitle = "Your active prescriptions and today's dose status." }: { filtered: Medication[]; takenIds: Set<number>; isPending: boolean; message: string; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void; title?: string; subtitle?: string }) {
  return (
    <section className="rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-1 text-xs text-[#8a96a8] dark:text-[#a8c4d3]">{subtitle}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#1e7b8c] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#176b7a]" aria-label="Add medication">
          <Plus size={15} /> Add
        </button>
      </div>
      {message && <p className="mt-4 rounded-lg bg-[#eef8f7] px-3 py-2 text-xs font-semibold text-[#277783] dark:bg-[#173247] dark:text-[#84B3CE]">{message}</p>}
      <div className="mt-6 space-y-3">
        {filtered.length ? filtered.map((medicine) => {
          const isTaken = takenIds.has(medicine.id)
          return (
            <div key={medicine.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#edf0f4] bg-white p-3.5 dark:border-[#315069] dark:bg-[#0f2635]">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f4f6] text-[#237e8c] dark:bg-[#173247] dark:text-[#84B3CE]">
                <Pill size={19} />
              </div>
              <div className="min-w-0 flex-1 basis-[140px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{medicine.name}</span>
                  {isTaken && <span className="rounded-full bg-[#e7f6ef] px-2 py-0.5 text-[10px] font-bold text-[#31835c] dark:bg-[#143c31] dark:text-[#8bd9ad]">Taken</span>}
                </div>
                <div className="mt-1 text-xs text-[#8491a3] dark:text-[#a8c4d3]">
                  {medicine.dosage} <span className="mx-1 text-[#c1c8d1]">·</span> {medicine.frequency}
                </div>
              </div>
              <div className="hidden items-center gap-2 text-xs text-[#8592a4] sm:flex dark:text-[#a8c4d3]">
                <Clock3 size={14} /> Today
              </div>
              <button
                disabled={isPending}
                aria-label={`${isTaken ? 'Undo' : 'Mark'} ${medicine.name} as taken`}
                onClick={() => toggleDose(medicine.id)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition ${isTaken ? 'border-[#b9dfcb] bg-[#eaf8f0] text-[#3c956a] dark:border-[#2c6b4b] dark:bg-[#143c31]' : 'border-[#dfe6ec] text-[#6c7b8b] hover:border-[#8fc9cf] hover:text-[#247d89] dark:border-[#315069] dark:text-[#bdd5df]'}`}
              >
                <Check size={16} />
              </button>
              <button
                onClick={() => archive(medicine)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#9aa5b4] hover:bg-[#fff2f2] hover:text-[#b45e68] dark:hover:bg-[#3a1f2a]"
                aria-label={`Archive ${medicine.name}`}
              >
                <X size={15} />
              </button>
            </div>
          )
        }) : (
          <div className="rounded-xl border border-dashed border-[#dfe6ec] px-6 py-12 text-center dark:border-[#315069]">
            <Pill className="mx-auto text-[#a9b6c3]" size={28} />
            <p className="mt-3 text-sm font-bold">Your medication list is empty</p>
            <p className="mt-1 text-xs text-[#8794a5] dark:text-[#a8c4d3]">Add a prescription to begin tracking doses.</p>
            <button onClick={() => setShowAdd(true)} className="mt-4 rounded-lg bg-[#1e7b8c] px-4 py-2 text-xs font-bold text-white">Add medication</button>
          </div>
        )}
      </div>
    </section>
  )
}

/** Dedicated full-screen medicines management view (route: /medicines). */
function MedicinesView({ medications, filtered, takenIds, isPending, message, query, setQuery, setShowAdd, toggleDose, archive }: { medications: Medication[]; filtered: Medication[]; takenIds: Set<number>; isPending: boolean; message: string; query: string; setQuery: (value: string) => void; setShowAdd: (value: boolean) => void; toggleDose: (id: number) => void; archive: (medicine: Medication) => void }) {
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
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#1e7b8c] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#176b7a]"
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
          className="h-11 w-full rounded-xl border border-[#e3e8ee] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-[#a5afbc] focus:border-[#8ecbd0] dark:border-[#315069] dark:bg-[#132b3b] dark:text-[#f5eedd]"
        />
      </div>
      {/* Full medication list */}
      <MedicationList
        filtered={filtered}
        takenIds={takenIds}
        isPending={isPending}
        message={message}
        setShowAdd={setShowAdd}
        toggleDose={toggleDose}
        archive={archive}
        title="All medications"
        subtitle="Manage your care plan. Tap the check to log or undo a dose."
      />
    </div>
  )
}

function SettingsView({ settings, permissionMessage, vapidConfigured, hasActiveSubscription, onToggleReminders, onToggleTimezone, onEnableBrowser }: { settings: NotificationSettings; permissionMessage: string; vapidConfigured: boolean; hasActiveSubscription: boolean; onToggleReminders: (enabled: boolean) => void; onToggleTimezone: (tz: string) => void; onEnableBrowser: () => void }) {
  return (
    <section className="max-w-3xl rounded-2xl border border-[#e5eaf1] bg-white p-5 sm:p-6 dark:border-[#254258] dark:bg-[#132b3b]">
      <h2 className="text-base font-bold">Medication reminders</h2>
      <p className="mt-1 text-xs text-[#8a96a8] dark:text-[#a8c4d3]">MediTrack reminds you when a scheduled medication is due.</p>
      
      <div className="mt-6 space-y-4">
        {/* Enable Reminders Switch */}
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <span>
            <span className="block text-sm font-bold">Enable reminders</span>
            <span className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">Creates in-app reminders and schedules push events.</span>
          </span>
          <input type="checkbox" checked={settings.medicationReminders} onChange={(e) => onToggleReminders(e.target.checked)} className="h-5 w-5 accent-[#1e7b8c]" />
        </label>

        {/* Push Notifications Configuration */}
        <div className="rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold">Browser push notifications</div>
              <p className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">
                Allow notifications to receive background medication reminders even when the website is closed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${vapidConfigured ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                  {vapidConfigured ? 'Server configured' : 'VAPID missing'}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${hasActiveSubscription ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'}`}>
                  {hasActiveSubscription ? 'Device subscribed' : 'No active subscription'}
                </span>
              </div>
            </div>
            <button onClick={onEnableBrowser} disabled={!vapidConfigured} className="min-h-11 rounded-lg bg-[#1e7b8c] px-4 text-xs font-bold text-white hover:bg-[#176b7a] disabled:opacity-50">
              Enable on this device
            </button>
          </div>
          {permissionMessage && <p className="mt-3 text-xs font-semibold text-[#c58b35]">{permissionMessage}</p>}
        </div>

        {/* Timezone Setting */}
        <div className="flex items-center justify-between rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <div>
            <span className="block text-sm font-bold">Timezone</span>
            <span className="text-xs text-[#8491a3] dark:text-[#a8c4d3]">Reminders schedule relative to this timezone.</span>
          </div>
          <select value={settings.timezone} onChange={(e) => onToggleTimezone(e.target.value)} className="h-10 rounded-lg border border-[#dfe6ec] bg-white px-2 text-xs text-[#18243a] outline-none dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]">
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

        {/* Theme Settings */}
        <div className="flex items-center justify-between rounded-xl border border-[#edf0f4] p-4 dark:border-[#315069]">
          <span className="text-sm font-bold">Color theme</span>
          <ThemeSelect />
        </div>
      </div>
    </section>
  )
}

function NotificationPanel({ notifications, onRead, onDismiss, onTake }: { notifications: NotificationRow[]; onRead: (id: number) => void; onDismiss: (id: number) => void; onTake: (id: number, medicationId: number | null) => void }) {
  return <div className="absolute right-4 top-[70px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-[#e5eaf1] bg-white p-3 shadow-xl dark:border-[#254258] dark:bg-[#132b3b]"><div className="px-2 py-1 text-sm font-bold">Notifications</div><div className="mt-2 max-h-[420px] space-y-2 overflow-auto">{notifications.length ? notifications.map((item) => <div key={item.id} className={`rounded-lg border p-3 ${item.read ? 'border-[#edf0f4] dark:border-[#315069]' : 'border-[#84B3CE] bg-[#f3f8f8] dark:bg-[#173247]'}`}><div className="text-sm font-bold">{item.title}</div><p className="mt-1 text-xs text-[#718096] dark:text-[#b9d1df]">{item.message}</p><div className="mt-3 flex gap-2"><button onClick={() => onTake(item.id, item.medicationId)} className="rounded-lg bg-[#1e7b8c] px-3 py-2 text-xs font-bold text-white">Take now</button><button onClick={() => onRead(item.id)} className="rounded-lg border border-[#dfe6ec] px-3 py-2 text-xs font-bold dark:border-[#315069]">Mark read</button><button onClick={() => onDismiss(item.id)} className="ml-auto rounded-lg p-2 text-[#9aa5b4]" aria-label="Dismiss notification"><X size={15} /></button></div></div>) : <p className="px-2 py-8 text-center text-xs text-[#718096] dark:text-[#b9d1df]">No reminders right now.</p>}</div></div>
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

function AddMedication({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('Once daily')
  const [timeOfDay, setTimeOfDay] = useState('08:00')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18243a]/40 p-4 backdrop-blur-sm"><form onSubmit={(event) => { event.preventDefault(); startTransition(async () => { try { await createMedication({ name, dosage, frequency, timeOfDay }); onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save medication.') } }) }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6 dark:bg-[#132b3b]"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Add medication</h2><p className="mt-1 text-xs text-[#8794a5] dark:text-[#a8c4d3]">Keep your care plan up to date.</p></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#95a0af] hover:bg-[#f3f6f8] dark:hover:bg-[#173247]" aria-label="Close dialog"><X size={18} /></button></div>{error && <p className="mt-4 rounded-lg bg-[#fff2f2] px-3 py-2 text-xs font-semibold text-[#b45e68] dark:bg-[#3a1f2a]">{error}</p>}<div className="mt-6 space-y-4"><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Medication name<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none focus:border-[#7fc4c9] dark:border-[#315069] dark:bg-[#173247]" placeholder="e.g. Lisinopril" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Dosage<input required value={dosage} onChange={(e) => setDosage(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none focus:border-[#7fc4c9] dark:border-[#315069] dark:bg-[#173247]" placeholder="10 mg" /></label><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Due time<input type="time" required value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none focus:border-[#7fc4c9] dark:border-[#315069] dark:bg-[#173247]" /></label></div><label className="block text-xs font-bold text-[#5f6e82] dark:text-[#b9d1df]">Frequency<select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none focus:border-[#7fc4c9] dark:border-[#315069] dark:bg-[#173247]"><option>Once daily</option><option>Twice daily</option><option>As needed</option></select></label><button disabled={pending} className="mt-2 w-full rounded-lg bg-[#1e7b8c] py-3 text-sm font-bold text-white hover:bg-[#176b7a] disabled:opacity-60">{pending ? 'Saving...' : 'Save medication'}</button></div></form></div>
}

function StatCard({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  const tones: Record<string, string> = { green: 'bg-[#e8f7ef] text-[#3a956a] dark:bg-[#143c31] dark:text-[#8bd9ad]', blue: 'bg-[#e5f4f6] text-[#237e8c] dark:bg-[#173247] dark:text-[#84B3CE]', orange: 'bg-[#fff3e2] text-[#c58b35] dark:bg-[#3a2f19] dark:text-[#f0bd66]' }
  return <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)] dark:border-[#254258] dark:bg-[#132b3b]"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><div className="min-w-0"><div className="text-xs font-semibold text-[#8793a5] dark:text-[#a8c4d3]">{label}</div><div className="mt-0.5 flex flex-wrap items-baseline gap-2"><span className="text-xl font-bold tracking-tight">{value}</span><span className="text-[10px] font-semibold text-[#8a97a8] dark:text-[#b9d1df]">{note}</span></div></div></div>
}

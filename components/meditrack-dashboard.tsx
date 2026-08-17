'use client'

import { useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Pill,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react'

const medicines = [
  { id: 1, name: 'Lisinopril', dose: '10 mg', detail: '1 tablet · Daily', color: 'sky', status: 'taken' },
  { id: 2, name: 'Metformin', dose: '500 mg', detail: '1 tablet · With breakfast', color: 'violet', status: 'taken' },
  { id: 3, name: 'Vitamin D3', dose: '2000 IU', detail: '1 softgel · Daily', color: 'amber', status: 'upcoming' },
  { id: 4, name: 'Atorvastatin', dose: '20 mg', detail: '1 tablet · At bedtime', color: 'rose', status: 'upcoming' },
]

const week = [
  { day: 'Mon', date: '12', value: 96 },
  { day: 'Tue', date: '13', value: 100 },
  { day: 'Wed', date: '14', value: 84 },
  { day: 'Thu', date: '15', value: 100 },
  { day: 'Fri', date: '16', value: 92 },
  { day: 'Sat', date: '17', value: 78 },
  { day: 'Sun', date: '18', value: 100 },
]

export default function Page() {
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [showAdd, setShowAdd] = useState(false)
  const [taken, setTaken] = useState<number[]>([1, 2])
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => medicines.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())), [query])

  function markTaken(id: number) {
    setTaken((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#18243a]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-[#e5eaf1] bg-white lg:flex lg:flex-col">
        <div className="flex h-[82px] items-center gap-3 border-b border-[#eef1f5] px-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e7b8c] text-white shadow-sm"><HeartPulse size={22} /></div>
          <div><div className="text-[17px] font-bold tracking-tight">MediTrack</div><div className="text-[11px] font-medium text-[#8390a4]">Personal health, organized.</div></div>
        </div>
        <div className="flex flex-1 flex-col px-4 py-7">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9aa6b7]">Workspace</div>
          <nav className="space-y-1">
            {[
              ['Dashboard', LayoutDashboard], ['Medications', Pill], ['Schedule', CalendarDays], ['History', FileText], ['Analytics', TrendingUp],
            ].map(([label, Icon]) => <button key={label as string} onClick={() => setActiveNav(label as string)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${activeNav === label ? 'bg-[#eaf6f6] text-[#146b7a]' : 'text-[#718096] hover:bg-[#f5f7fa]'}`}><Icon size={18} strokeWidth={1.9} /><span>{label as string}</span>{label === 'Medications' && <span className="ml-auto rounded-full bg-[#edf1f5] px-2 py-0.5 text-[10px] text-[#728097]">4</span>}</button>)}
          </nav>
          <div className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9aa6b7]">Manage</div>
          <nav className="space-y-1"><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#718096] hover:bg-[#f5f7fa]"><Bell size={18} /><span>Notifications</span><span className="ml-auto h-2 w-2 rounded-full bg-[#f2a65a]" /></button><button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#718096] hover:bg-[#f5f7fa]"><Settings size={18} /><span>Settings</span></button></nav>
          <div className="mt-auto rounded-xl bg-[#f3f8f8] p-4"><div className="flex items-center gap-2 text-[#1f7988]"><ShieldCheck size={17} /><span className="text-xs font-bold">Your data is private</span></div><p className="mt-2 text-[11px] leading-5 text-[#77909a]">Encrypted and only visible to you.</p></div>
        </div>
        <div className="flex items-center gap-3 border-t border-[#eef1f5] px-5 py-5"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbe9ee] text-sm font-bold text-[#256b79]">JD</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">Jordan Davis</div><div className="truncate text-[11px] text-[#8b98aa]">jordan@example.com</div></div><MoreHorizontal size={17} className="text-[#9aa5b4]" /></div>
      </aside>

      <main className="lg:pl-[248px]">
        <header className="flex h-[82px] items-center justify-between border-b border-[#e5eaf1] bg-white px-5 sm:px-8"><div className="flex items-center gap-3"><button className="lg:hidden"><Menu size={21} /></button><div><div className="text-xl font-bold tracking-[-0.02em]">Good morning, Jordan <span className="text-[#1e7b8c]">.</span></div><div className="mt-1 text-xs text-[#8592a5]">Sunday, August 18, 2026 <span className="mx-1.5 text-[#c3cad4]">·</span> You&apos;re doing great today.</div></div></div><div className="flex items-center gap-3"><button className="relative rounded-lg p-2 text-[#7d8a9d] hover:bg-[#f3f6f8]"><Bell size={19} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f2a65a]" /></button><div className="hidden h-7 w-px bg-[#e8ecf1] sm:block" /><button className="flex items-center gap-2 text-xs font-bold"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe9ee] text-[#256b79]">JD</div><ChevronDown size={14} className="text-[#8c98a9]" /></button></div></header>

        <div className="mx-auto max-w-[1380px] p-5 sm:p-8">
          <section className="grid gap-4 md:grid-cols-3"><StatCard icon={<Check size={18} />} tone="green" label="Today&apos;s adherence" value={`${taken.length} / 4`} note="75% completed" /><StatCard icon={<Pill size={18} />} tone="blue" label="Active medications" value="4" note="All prescriptions up to date" /><StatCard icon={<Activity size={18} />} tone="orange" label="Current streak" value="12 days" note="Your best: 18 days" /></section>

          <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-base font-bold">Today&apos;s medications</h2><p className="mt-1 text-xs text-[#8a96a8]">Sunday, August 18 <span className="mx-1">·</span> 2 of 4 taken</p></div><button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-[#1e7b8c] px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#176b7a]"><Plus size={15} /> Add medication</button></div><div className="mt-6 space-y-3">{filtered.map((medicine) => { const isTaken = taken.includes(medicine.id); return <div key={medicine.id} className={`flex items-center gap-3 rounded-xl border p-3.5 transition ${isTaken ? 'border-[#e6eef0] bg-[#fbfdfd]' : 'border-[#edf0f4] bg-white'}`}><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${medicine.color === 'sky' ? 'bg-[#e5f4f6] text-[#237e8c]' : medicine.color === 'violet' ? 'bg-[#efebfb] text-[#7864b4]' : medicine.color === 'amber' ? 'bg-[#fff4df] text-[#c18b2d]' : 'bg-[#fbe9eb] text-[#c46d78]'}`}><Pill size={19} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-bold">{medicine.name}</span>{isTaken && <span className="rounded-full bg-[#e7f6ef] px-2 py-0.5 text-[10px] font-bold text-[#31835c]">Taken</span>}</div><div className="mt-1 text-xs text-[#8491a3]">{medicine.dose} <span className="mx-1 text-[#c1c8d1]">·</span> {medicine.detail.split(' · ')[1]}</div></div><div className="hidden items-center gap-2 text-xs text-[#8592a4] sm:flex"><Clock3 size={14} /> {medicine.id === 1 ? '8:00 AM' : medicine.id === 2 ? '8:30 AM' : medicine.id === 3 ? '12:00 PM' : '9:00 PM'}</div><button aria-label={`${isTaken ? 'Undo' : 'Mark'} ${medicine.name} as taken`} onClick={() => markTaken(medicine.id)} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${isTaken ? 'border-[#b7dec9] bg-[#e8f7ef] text-[#31835c]' : 'border-[#dbe2e9] text-[#9aa6b5] hover:border-[#1e7b8c] hover:text-[#1e7b8c]'}`}>{isTaken ? <Check size={16} /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-current" />}</button></div>})}</div><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d9e2e8] py-3 text-xs font-bold text-[#8290a1] hover:border-[#9ccbd0] hover:text-[#1e7b8c]"><CalendarDays size={15} /> View full schedule</button></section>

            <section className="rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-base font-bold">Adherence overview</h2><p className="mt-1 text-xs text-[#8a96a8]">Last 7 days</p></div><button className="text-xs font-bold text-[#1e7b8c]">View analytics</button></div><div className="mt-7 flex items-end justify-between gap-2">{week.map((item) => <div key={item.day} className="flex flex-1 flex-col items-center gap-2"><div className="flex h-28 w-full items-end justify-center"><div className={`w-full max-w-[28px] rounded-t-md ${item.value >= 95 ? 'bg-[#75c6c0]' : item.value >= 85 ? 'bg-[#f1c27c]' : 'bg-[#e8a1a3]'}`} style={{ height: `${item.value * 0.9}%` }} /></div><div className="text-[10px] font-semibold text-[#96a1b0]">{item.day}</div><div className={`text-[10px] font-bold ${item.day === 'Sun' ? 'text-[#1e7b8c]' : 'text-[#657389]'}`}>{item.value}%</div></div>)}</div><div className="mt-7 border-t border-[#eef1f4] pt-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#66758b]">Weekly average</span><span className="text-lg font-bold text-[#1d7c88]">93%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1f3]"><div className="h-full w-[93%] rounded-full bg-[#75c6c0]" /></div></div></section>
          </div>

          <section className="mt-6 rounded-2xl border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(31,52,76,0.025)] sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-base font-bold">Medication history</h2><p className="mt-1 text-xs text-[#8a96a8]">A clear record of your recent doses.</p></div><div className="flex items-center gap-3"><div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-[#9aa6b5]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medication" className="h-9 w-full rounded-lg border border-[#e3e8ee] bg-[#fbfcfd] pl-9 pr-3 text-xs outline-none placeholder:text-[#a5afbc] focus:border-[#8ecbd0] sm:w-48" /></div><button className="hidden items-center gap-2 rounded-lg border border-[#e3e8ee] px-3 py-2 text-xs font-bold text-[#778599] sm:flex"><CalendarDays size={14} /> This week <ChevronDown size={14} /></button></div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-[#eef1f4] text-[10px] uppercase tracking-[0.12em] text-[#9aa5b3]"><th className="pb-3 font-bold">Medication</th><th className="pb-3 font-bold">Date &amp; time</th><th className="pb-3 font-bold">Dosage</th><th className="pb-3 font-bold">Status</th><th className="pb-3" /></tr></thead><tbody>{[['Lisinopril','Today, 8:02 AM','10 mg','Taken'],['Metformin','Today, 8:31 AM','500 mg','Taken'],['Vitamin D3','Yesterday, 12:04 PM','2000 IU','Taken'],['Atorvastatin','Yesterday, 9:00 PM','20 mg','Missed']].map((row) => <tr key={row[0] + row[1]} className="border-b border-[#f1f3f6] last:border-0"><td className="py-4 text-xs font-bold">{row[0]}</td><td className="py-4 text-xs text-[#8290a2]">{row[1]}</td><td className="py-4 text-xs text-[#8290a2]">{row[2]}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${row[3] === 'Taken' ? 'bg-[#e7f6ef] text-[#31835c]' : 'bg-[#fff0e8] text-[#c77849]'}`}>{row[3]}</span></td><td className="py-4 text-right"><button className="text-[#a0aab7] hover:text-[#52677d]"><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>
        </div>
      </main>

      {showAdd && <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#18243a]/30 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Add medication</h2><p className="mt-1 text-xs text-[#8794a5]">Keep your care plan up to date.</p></div><button onClick={() => setShowAdd(false)} className="rounded-lg p-1.5 text-[#95a0af] hover:bg-[#f3f6f8]"><X size={18} /></button></div><div className="mt-6 space-y-4"><label className="block text-xs font-bold text-[#5f6e82]">Medication name<input className="mt-2 h-10 w-full rounded-lg border border-[#dfe6ec] px-3 text-sm outline-none focus:border-[#7fc4c9]" placeholder="e.g. Lisinopril" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold text-[#5f6e82]">Dosage<input className="mt-2 h-10 w-full rounded-lg border border-[#dfe6ec] px-3 text-sm outline-none focus:border-[#7fc4c9]" placeholder="10 mg" /></label><label className="block text-xs font-bold text-[#5f6e82]">Frequency<select className="mt-2 h-10 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm outline-none focus:border-[#7fc4c9]"><option>Once daily</option><option>Twice daily</option><option>As needed</option></select></label></div><button onClick={() => setShowAdd(false)} className="mt-2 w-full rounded-lg bg-[#1e7b8c] py-3 text-sm font-bold text-white hover:bg-[#176b7a]">Save medication</button></div></div></div>}
    </div>
  )
}

function StatCard({ icon, tone, label, value, note }: { icon: React.ReactNode; tone: string; label: string; value: string; note: string }) {
  const tones: Record<string, string> = { green: 'bg-[#e8f7ef] text-[#3a956a]', blue: 'bg-[#e5f4f6] text-[#237e8c]', orange: 'bg-[#fff3e2] text-[#c58b35]' }
  return <div className="flex items-center gap-4 rounded-2xl border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(31,52,76,0.025)]"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div><div><div className="text-xs font-semibold text-[#8793a5]">{label}</div><div className="mt-0.5 flex items-baseline gap-2"><span className="text-xl font-bold tracking-tight">{value}</span><span className="text-[10px] font-semibold text-[#8a97a8]">{note}</span></div></div></div>
}

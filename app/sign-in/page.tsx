import Link from 'next/link'
import { AuthForm } from '@/components/auth-form'
import { HeartPulse } from 'lucide-react'

export default function SignInPage() { return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-5"><section className="w-full max-w-md rounded-2xl border border-[#e5eaf1] bg-white p-7 shadow-sm"><div className="mb-7 flex flex-col items-center text-center"><img src="/branding/meditrack-logo-stacked.png" alt="MediTrack Logo" className="h-28 w-auto object-contain" /><p className="mt-2 text-xs text-[#8390a4]">Personal health, organized.</p></div><h1 className="text-2xl font-bold text-[#18243a]">Welcome back</h1><p className="mt-2 text-sm leading-6 text-[#8390a4]">Sign in to keep your care plan in reach.</p><div className="mt-6"><AuthForm mode="sign-in" /></div><p className="mt-6 text-center text-sm text-[#8390a4]">New to MediTrack? <Link className="font-bold text-[#1e7b8c]" href="/sign-up">Create an account</Link></p></section></main> }

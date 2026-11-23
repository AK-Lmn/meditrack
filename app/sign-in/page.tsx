import { WeekbookBrand } from '@/components/weekbook-brand'
import Link from 'next/link'
import { AuthForm } from '@/components/auth-form'

export const metadata = { title: "Sign in" }

export default function SignInPage() { return <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-[#edf5f2] p-5 dark:bg-[#14241f]"><section className="w-full max-w-md rounded-2xl border border-[#c4d7cf] bg-white p-6 shadow-sm dark:border-[#48675a] dark:bg-[#1c3029] sm:p-7"><div className="mb-6"><WeekbookBrand /></div><h1 className="text-2xl font-bold text-[#15302b] dark:text-[#ecf8f2]">Welcome back</h1><p className="mt-2 text-sm leading-6 text-copy-muted dark:text-[#b4d0c5]">Sign in to keep your care plan in reach.</p><div className="mt-6"><AuthForm mode="sign-in" /></div><p className="mt-6 text-center text-sm text-copy-muted dark:text-[#b4d0c5]">New to MediTrack? <Link className="app-focus rounded font-bold text-[#155b48] dark:text-[#9de6ca]" href="/sign-up">Create an account</Link></p></section></main> }

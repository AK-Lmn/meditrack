'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] p-6"><div className="max-w-md rounded-2xl border border-[#e5eaf1] bg-white p-8 text-center shadow-sm"><h1 className="text-lg font-bold text-[#18243a]">We couldn&apos;t load your care plan</h1><p className="mt-2 text-sm leading-6 text-[#718096]">Your data is safe. Try again, and we&apos;ll reconnect to your private health workspace.</p><button onClick={() => reset()} className="mt-6 rounded-lg bg-[#1e7b8c] px-4 py-2 text-sm font-bold text-white">Try again</button></div></main>
}

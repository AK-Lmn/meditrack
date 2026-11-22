import Link from 'next/link'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center p-6">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <Link className="app-focus inline-block rounded font-semibold underline" href="/">Return to dashboard</Link>
      </div>
    </main>
  )
}

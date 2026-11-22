import { AppAnalytics } from '@/components/app-analytics'
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Dashboard | MediTrack', template: '%s | MediTrack' },
  description: 'A clear, private medication tracker for staying on top of your daily care.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MediTrack',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon-192.png',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5eedd' },
    { media: '(prefers-color-scheme: dark)', color: '#0d2230' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function() {
              try {
                const saved = localStorage.getItem('meditrack-theme') || 'system';
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isDark = saved === 'dark' || (saved === 'system' && prefersDark);
                document.documentElement.classList.toggle('dark', isDark);
                if (saved !== 'system') {
                  document.documentElement.classList.toggle('light', saved === 'light');
                }
              } catch (e) {}
            })()`,
          }}
        />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="app-focus sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-[#18243a] dark:focus:bg-[#132b3b] dark:focus:text-[#f5eedd]">Skip to main content</a>
        <ThemeProvider>{children}</ThemeProvider>
        {process.env.NODE_ENV === 'production' && <AppAnalytics />}
      </body>
    </html>
  )
}

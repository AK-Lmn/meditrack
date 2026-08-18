'use client'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
export type Theme = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Resolve the effective dark/light state and apply .dark class to <html>. */
function apply(theme: Theme) {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const effectiveDark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', effectiveDark)
  // Remove the explicit light/dark class in system mode so CSS media query
  // colours (background, foreground CSS vars) still work alongside the class.
  if (theme === 'system') {
    root.classList.remove('light')
  } else {
    root.classList.toggle('light', theme === 'light')
  }
  root.dataset.theme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')

  useEffect(() => {
    const saved = (localStorage.getItem('meditrack-theme') as Theme) || 'system'
    setThemeState(saved)
    apply(saved)

    // When theme is system, keep .dark class in sync with OS preference changes.
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleOsChange = () => {
      const current = (localStorage.getItem('meditrack-theme') as Theme) || 'system'
      if (current === 'system') apply('system')
    }
    mediaQuery.addEventListener('change', handleOsChange)
    return () => mediaQuery.removeEventListener('change', handleOsChange)
  }, [])

  const value = useMemo(() => ({
    theme,
    setTheme: (next: Theme) => {
      localStorage.setItem('meditrack-theme', next)
      setThemeState(next)
      apply(next)
    },
  }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  return (
    <label className="text-xs font-semibold text-[#5c6d80] dark:text-[#b9d1df]">
      <span className={compact ? 'sr-only' : ''}>Theme</span>
      <select
        aria-label="Color theme"
        value={theme}
        onChange={e => setTheme(e.target.value as Theme)}
        className={`${compact ? '' : 'ml-2'} h-10 rounded-lg border border-[#dfe6ec] bg-white px-2 text-xs text-[#18243a] outline-none focus:border-[#84B3CE] dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]`}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  )
}

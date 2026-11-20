'use client'

import { useState } from 'react'

export const authInput = 'app-focus min-h-11 w-full rounded-lg border border-[#dfe6ec] bg-white px-3 text-sm dark:border-[#315069] dark:bg-[#173247] dark:text-[#f5eedd]'

export function PasswordField({ label, name, autoComplete, descriptionId }: { label: string; name: string; autoComplete: 'current-password' | 'new-password'; descriptionId?: string }) {
  const [visible, setVisible] = useState(false)
  return <div>
    <div className="relative">
      <label className="grid gap-2 text-sm font-semibold">{label}
        <input name={name} type={visible ? 'text' : 'password'} required autoComplete={autoComplete} aria-describedby={descriptionId} className={`${authInput} pr-20`} />
      </label>
      <button type="button" onClick={() => setVisible((value) => !value)} className="app-focus absolute bottom-0 right-1 min-h-11 rounded-md px-2 text-xs font-semibold" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>
}

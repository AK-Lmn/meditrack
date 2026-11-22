'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type FieldError = { id: string; message: string }

export function fieldErrorAttributes(error: FieldError | undefined, descriptionId?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [descriptionId, error?.id].filter(Boolean).join(' ') || undefined,
  }
}

export function FieldErrorMessage({ error }: { error?: FieldError }) {
  return error && <span id={error.id} className="mt-1 block text-sm font-normal text-[#a34f5a] dark:text-[#f3b3bb]">{error.message}</span>
}

export function useFieldErrors() {
  const id = useId()
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    const first = Object.keys(errors).find((name) => errors[name])
    if (!first) return
    const field = formRef.current?.elements.namedItem(first)
    if (field instanceof HTMLElement) field.focus()
  }, [errors])

  return {
    validate(form: HTMLFormElement, nextErrors: Record<string, string | undefined>) {
      formRef.current = form
      setErrors(nextErrors)
      return !Object.values(nextErrors).some(Boolean)
    },
    errorFor(name: string): FieldError | undefined {
      const message = errors[name]
      return message ? { id: `${id}-${name}-error`, message } : undefined
    },
    clear() {
      setErrors({})
    },
  }
}

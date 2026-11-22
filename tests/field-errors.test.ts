import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PasswordField } from '@/components/password-field'

it('links a password error without losing the existing password guidance', () => {
  const markup = renderToStaticMarkup(createElement(PasswordField, {
    label: 'Password', name: 'password', autoComplete: 'new-password',
    descriptionId: 'password-rules', error: { id: 'password-error', message: 'Enter your password.' },
  }))
  expect(markup).toContain('aria-invalid="true"')
  expect(markup).toContain('aria-describedby="password-rules password-error"')
  expect(markup).toMatch(/<span id="password-error"[^>]*>Enter your password\.<\/span>/)
})

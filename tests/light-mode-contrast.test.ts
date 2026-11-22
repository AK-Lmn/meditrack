import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function luminance(hex: string) {
  const [red, green, blue] = hex.match(/\w{2}/g)!.map((pair) => {
    const channel = Number.parseInt(pair, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

it.each([
  ['copy-muted', 4.5],
  ['field-border', 3],
  ['app-focus-ring', 3],
])('keeps the light %s color above contrast requirements', (token, minimum) => {
  const color = css.match(new RegExp(`--${token}: #([0-9a-f]{6});`, 'i'))?.[1]
  expect(color).toBeDefined()
  for (const surface of ['ffffff', 'f6f8fb']) {
    const ratio = (luminance(surface) + 0.05) / (luminance(color!) + 0.05)
    expect(ratio).toBeGreaterThanOrEqual(minimum)
  }
})

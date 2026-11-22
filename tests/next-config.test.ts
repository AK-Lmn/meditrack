import { expect, it } from 'vitest'
import config from '../next.config.mjs'

it('checks TypeScript during production builds', () => {
  expect(config).not.toMatchObject({ typescript: { ignoreBuildErrors: true } })
})

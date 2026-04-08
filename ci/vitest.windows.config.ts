import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['ci/windows-config-ownership.spec.ts'],
  },
})

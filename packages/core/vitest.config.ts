import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'refkit-core',
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})

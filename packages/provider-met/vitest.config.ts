import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'provider-met', environment: 'node', include: ['src/**/*.{test,spec}.ts'] } })

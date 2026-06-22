import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'provider-brave', environment: 'node', include: ['src/**/*.{test,spec}.ts'] } })

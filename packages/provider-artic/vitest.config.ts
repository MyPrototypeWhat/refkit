import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'provider-artic', environment: 'node', include: ['src/**/*.{test,spec}.ts'] } })

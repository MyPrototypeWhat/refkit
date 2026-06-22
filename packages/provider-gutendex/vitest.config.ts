import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { name: 'provider-gutendex', environment: 'node', include: ['src/**/*.{test,spec}.ts'] } })

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/perf-baseline.spec.ts'],
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: 'http://app.local',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: /perf-baseline\.spec\.ts/,
  timeout: 60000,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    timeout: 30000,
    reuseExistingServer: false,
  },
})

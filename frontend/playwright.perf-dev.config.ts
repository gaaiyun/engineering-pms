import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  testMatch: /perf-baseline\.spec\.ts/,
  timeout: 90000,
  reporter: 'line',
  use: { baseURL: 'http://localhost:5175', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite --port 5175 --strictPort',
    url: 'http://localhost:5175',
    timeout: 60000,
    reuseExistingServer: false,
  },
})

import { defineConfig, devices } from '@playwright/test'

/**
 * E2E contra la Supabase LOCAL (Docker). La app se construye en `.next-e2e` (no pisa el `.next`
 * de un `npm run dev` abierto) y corre en :3100 con las variables de `supabase status`.
 * global-setup valida el entorno ANTES de crear usuarios: nunca corre contra la nube.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    locale: 'es-HN',
    timezoneId: 'America/Tegucigalpa',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'telefono', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'node scripts/dev-local.mjs --build --start --port 3100',
    url: 'http://localhost:3100/login',
    env: { NEXT_DIST_DIR: '.next-e2e' },
    reuseExistingServer: false,
    timeout: 300_000,
  },
})

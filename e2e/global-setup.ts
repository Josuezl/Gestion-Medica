import { execFileSync } from 'node:child_process'
import { chromium, type FullConfig } from '@playwright/test'
import { validarEntornoE2e } from './guardia-entorno'
import { PASSWORD_E2E, USUARIOS_E2E, archivoSesion, statusSupabaseLocal, type RolE2e } from './entorno'

export default async function globalSetup(config: FullConfig) {
  // 1. El candado va PRIMERO: nada se crea si la base no es la local.
  const status = statusSupabaseLocal()
  validarEntornoE2e({ url: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY })

  // 2. Usuarios, horario y enlace público (idempotente; el script repite la validación).
  execFileSync('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/sembrar-usuarios-local.mjs'], { stdio: 'inherit' })

  // 3. Una sesión guardada por rol.
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3100'
  const browser = await chromium.launch()
  for (const rol of Object.keys(USUARIOS_E2E) as RolE2e[]) {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    await page.getByPlaceholder('ejemplo@doctor.com').fill(USUARIOS_E2E[rol])
    await page.locator('input[type=password]').fill(PASSWORD_E2E)
    await page.getByRole('button', { name: 'Entrar al Sistema' }).click()
    await page.waitForURL('**/dashboard**')
    await page.context().storageState({ path: archivoSesion(rol) })
    await page.close()
  }
  await browser.close()
}

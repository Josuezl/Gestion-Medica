import { test as base, type Browser, type Page, type TestInfo } from '@playwright/test'
import { archivoSesion, type RolE2e } from './entorno'

type Fixtures = { comoMedico: Page; comoAsistente: Page; comoAdmin: Page }

// Cada fixture abre un contexto propio con la sesión guardada en global-setup y el dispositivo
// del proyecto (escritorio o teléfono).
function paginaComo(rol: RolE2e) {
  return async ({ browser }: { browser: Browser }, use: (p: Page) => Promise<void>, testInfo: TestInfo) => {
    const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL, locale, timezoneId } = testInfo.project.use
    const context = await browser.newContext({
      viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL, locale, timezoneId,
      storageState: archivoSesion(rol),
    })
    const page = await context.newPage()
    await use(page)
    await context.close()
  }
}

export const test = base.extend<Fixtures>({
  comoMedico: paginaComo('medico'),
  comoAsistente: paginaComo('asistente'),
  comoAdmin: paginaComo('admin'),
})
export { expect } from '@playwright/test'

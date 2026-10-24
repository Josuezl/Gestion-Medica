import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { TOKEN_AGENDAR } from './entorno'

const AVISO = 'Hay una versión nueva de la aplicación.'

/** `/version.json` responde otra versión (como tras un despliegue), o falla si `abortar`. */
async function simularVersion(page: Page, modo: 'otra' | 'abortar') {
  await page.route('**/version.json', (route) =>
    modo === 'abortar'
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"otra-version-e2e"}' }))
}

/** Lo que dispara el navegador al volver a la pestaña. */
const volverALaPestana = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

function contarCargas(page: Page) {
  const cargas = { n: 0 }
  page.on('load', () => { cargas.n++ })
  return cargas
}

test('al navegar con versión nueva recarga sola y no queda aviso', async ({ comoMedico: page }) => {
  await page.goto('/dashboard')
  await simularVersion(page, 'otra')
  const cargas = contarCargas(page)
  // Navegación del cliente (Link de Next). En el teléfono el menú lateral está fuera de pantalla.
  await page.getByRole('link', { name: 'Pacientes' }).first().evaluate((a: HTMLElement) => a.click())
  await expect.poll(() => cargas.n).toBeGreaterThan(0)
  await expect(page).toHaveURL(/\/dashboard\/patients/)
  await expect(page.getByText(AVISO)).toBeHidden()
})

test('consulta a medias: avisa sin recargar y los campos siguen llenos', async ({ comoMedico: page }) => {
  await page.goto('/dashboard/patients')
  await page.getByRole('row', { name: /Carla Prueba Tres/ }).getByRole('link', { name: 'Consulta' }).click()
  await page.waitForURL(/\/dashboard\/consultations\/new\?patientId=/)
  const continuar = page.getByRole('button', { name: /Continuar con la consulta/ })
  if (await continuar.isVisible().catch(() => false)) await continuar.click()
  await page.locator('textarea[name=reason_for_visit]').fill('Control de rutina')

  await simularVersion(page, 'otra')
  const cargas = contarCargas(page)
  await volverALaPestana(page)
  await expect(page.getByText(AVISO)).toBeVisible()
  await expect(page.locator('textarea[name=reason_for_visit]')).toHaveValue('Control de rutina')
  expect(cargas.n).toBe(0)
})

test('sin respuesta de version.json: ni aviso ni recarga', async ({ comoMedico: page }) => {
  await page.goto('/dashboard')
  await simularVersion(page, 'abortar')
  const cargas = contarCargas(page)
  await volverALaPestana(page)
  await page.waitForTimeout(1500)
  await expect(page.getByText(AVISO)).toBeHidden()
  expect(cargas.n).toBe(0)
})

test('misma versión: nada', async ({ comoMedico: page }) => {
  await page.goto('/dashboard')
  const respuesta = page.waitForResponse('**/version.json')
  await volverALaPestana(page)
  expect((await respuesta).status()).toBe(200)
  await page.waitForTimeout(500)
  await expect(page.getByText(AVISO)).toBeHidden()
})

test('el paciente anónimo en /agendar también ve el aviso', async ({ page }) => {
  await page.goto(`/agendar/${TOKEN_AGENDAR}`)
  await simularVersion(page, 'otra')
  await volverALaPestana(page)
  await expect(page.getByText(AVISO)).toBeVisible()
})

test('paciente nuevo a medias: «Actualizar» conserva lo escrito', async ({ comoAsistente: page }) => {
  await page.goto('/dashboard/patients/new')
  await page.locator('input[name=first_name]').fill('Rosa')
  await page.locator('input[name=last_name]').fill('Respaldo')

  await simularVersion(page, 'otra')
  await volverALaPestana(page)
  await page.getByRole('button', { name: 'Actualizar' }).click()

  await expect(page.getByText('Recuperamos lo que escribiste. Revísalo y guarda.')).toBeVisible()
  await expect(page.locator('input[name=first_name]')).toHaveValue('Rosa')
  await expect(page.locator('input[name=last_name]')).toHaveValue('Respaldo')
})

test('con el aviso visible, guardar un paciente nuevo funciona por la ruta fija', async ({ comoAsistente: page }, testInfo) => {
  const apellido = `Aviso ${testInfo.project.name === 'telefono' ? 'Movil' : 'Escritorio'}`
  await page.goto('/dashboard/patients/new')
  await page.locator('input[name=first_name]').fill('Mario')
  await page.locator('input[name=last_name]').fill(apellido)
  await page.locator('input[name=birth_date]').fill('1980-01-20')
  await page.locator('select[name=gender]').selectOption('M')

  await simularVersion(page, 'otra')
  await volverALaPestana(page)
  await expect(page.getByText(AVISO)).toBeVisible()

  const guardado = page.waitForResponse((r) => r.url().endsWith('/api/guardar/paciente') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /Guardar y Abrir Expediente/ }).click()
  expect((await guardado).status()).toBe(200)
  await expect(page).toHaveURL(/\/dashboard\/patients\/[0-9a-f-]+\?creado=1/)
  await expect(page.getByText(`Mario ${apellido}`).first()).toBeVisible()
})

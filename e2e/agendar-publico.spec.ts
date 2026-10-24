import { test, expect } from './fixtures'
import { TOKEN_AGENDAR } from './entorno'

test('un paciente anónimo agenda en /agendar y la solicitud llega al dashboard', async ({ page, comoAsistente }, testInfo) => {
  const segundo = testInfo.project.name === 'telefono' ? 'Movil' : 'Escritorio'
  // IP propia por proyecto: el portal limita reservas por IP.
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.0.0.${testInfo.project.name === 'telefono' ? 2 : 1}` })

  await page.goto(`/agendar/${TOKEN_AGENDAR}`)
  await page.getByPlaceholder(/María José/).fill(`Lucía ${segundo} Ruiz Prado`)
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Paciente nuevo: completa el registro.
  await page.locator('input[type=date]').fill('1995-06-15')
  await page.getByPlaceholder('9999-9999').fill('9876-5432')
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Primer día y primera hora disponibles.
  await page.locator('button:not([disabled])').filter({ hasText: /^\d{1,2}$/ }).first().click()
  await page.getByRole('button', { name: /\d{1,2}:\d{2}/ }).first().click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Agendar cita' }).click()
  // Pantalla final (con código de seguimiento): recién ahí existe la solicitud.
  await expect(page.getByRole('button', { name: 'Copiar enlace de estado' })).toBeVisible()

  await comoAsistente.goto('/dashboard/solicitudes')
  await expect(comoAsistente.getByText(new RegExp(`Lucía ${segundo}`)).first()).toBeVisible()
})

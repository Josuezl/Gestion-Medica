import { test, expect } from './fixtures'
import { CLINICA_E2E, rest } from './rest'

// Un nombre con HTML (p. ej. llegado del formulario público de citas) debe imprimirse como texto,
// nunca ejecutarse: la impresión se abre como blob con el mismo origen que la app.
const NOMBRE = '<b>Equis</b>'
const ALERGIAS = '<img src=x onerror="window.__xss = 1">'

test('la impresión del expediente muestra el HTML como texto y no lo ejecuta', async ({ comoMedico: page }) => {
  let [paciente] = await rest(`patients?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.${encodeURIComponent(NOMBRE)}`)
  if (!paciente) {
    ;[paciente] = await rest('patients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        clinic_id: CLINICA_E2E, location_id: '00000000-0000-4000-a000-000000000011',
        first_name: NOMBRE, last_name: 'Inyeccion', gender: 'M', birth_date: '1980-01-01', allergies: ALERGIAS,
      }),
    })
  }

  await page.goto(`/dashboard/patients/${paciente.id}`)
  const [impresion] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: /Imprimir Ficha/ }).click(),
  ])
  await impresion.waitForLoadState()

  await expect(impresion.getByText(`${NOMBRE} Inyeccion`).first()).toBeVisible()
  await expect(impresion.getByText(ALERGIAS)).toBeVisible()
  expect(await impresion.locator('b, img').count()).toBe(0)
  expect(await impresion.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
})

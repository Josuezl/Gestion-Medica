import { test, expect } from './fixtures'

test('sin conexión la consulta no se pierde: el borrador se restaura', async ({ comoMedico: page }) => {
  await page.goto('/dashboard/patients')
  await page.getByRole('row', { name: /Bruno Prueba Dos/ }).getByRole('link', { name: 'Consulta' }).click()
  await page.waitForURL(/\/dashboard\/consultations\/new\?patientId=/)
  const continuar = page.getByRole('button', { name: /Continuar con la consulta/ })
  if (await continuar.isVisible().catch(() => false)) await continuar.click()
  const descartar = page.getByRole('button', { name: 'Descartar' })
  if (await descartar.isVisible().catch(() => false)) await descartar.click()

  await page.locator('textarea[name=reason_for_visit]').fill('Dolor lumbar de prueba')
  await page.locator('[name=diagnosis]').fill('Lumbalgia')
  await page.locator('[name=treatment_plan]').fill('Reposo')
  await page.waitForTimeout(2000) // autosave del borrador

  await page.context().setOffline(true)
  await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
  await expect(page.getByText(/Sin conexión a internet/)).toBeVisible()
  await page.context().setOffline(false)

  await page.reload()
  const continuar2 = page.getByRole('button', { name: /Continuar con la consulta/ })
  if (await continuar2.isVisible().catch(() => false)) await continuar2.click()
  await page.getByRole('button', { name: /Restaurar/ }).click()
  await expect(page.locator('textarea[name=reason_for_visit]')).toHaveValue('Dolor lumbar de prueba')
})

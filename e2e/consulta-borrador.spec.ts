import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Con consultas previas sale el «Resumen del Expediente», que trae dos botones «Continuar».
async function cerrarResumen(page: Page) {
  await page.getByRole('button', { name: /Continuar con la consulta/ }).first().click({ timeout: 4000 }).catch(() => {})
}

test('sin conexión la consulta no se pierde: el borrador se restaura', async ({ comoMedico: page }) => {
  await page.goto('/dashboard/patients?q=Bruno')
  await page.getByRole('row', { name: /Bruno Prueba Dos/ }).getByRole('link', { name: 'Consulta' }).click()
  await page.waitForURL(/\/dashboard\/consultations\/new\?patientId=/)
  await cerrarResumen(page)
  await page.getByRole('button', { name: 'Descartar' }).click({ timeout: 2000 }).catch(() => {})

  await page.locator('textarea[name=reason_for_visit]').fill('Dolor lumbar de prueba')
  await page.locator('[name=diagnosis]').fill('Lumbalgia')
  await page.locator('[name=treatment_plan]').fill('Reposo')
  // Los antecedentes son botones de opción: el borrador también debe restaurarlos.
  const alergias = page.locator('.ant-campo').filter({ hasText: 'Alergias' })
  await alergias.getByRole('radio', { name: 'Refiere' }).check()
  await alergias.locator('textarea').fill('Sulfas')
  await page.waitForTimeout(2000) // autosave del borrador

  await page.context().setOffline(true)
  await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
  await expect(page.getByText(/Sin conexión a internet/)).toBeVisible()
  await page.context().setOffline(false)

  await page.reload()
  await cerrarResumen(page)
  await page.getByRole('button', { name: /Restaurar/ }).click()
  await expect(page.locator('textarea[name=reason_for_visit]')).toHaveValue('Dolor lumbar de prueba')
  await expect(alergias.getByRole('radio', { name: 'Refiere' })).toBeChecked()
  await expect(alergias.locator('textarea')).toHaveValue('Sulfas')
})

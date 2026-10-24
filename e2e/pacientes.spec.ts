import { test, expect } from './fixtures'

test('el asistente crea un paciente y aparece en la lista y en su ficha', async ({ comoAsistente: page }, testInfo) => {
  const apellido = `Nuevo ${testInfo.project.name === 'telefono' ? 'Movil' : 'Escritorio'}`
  await page.goto('/dashboard/patients/new')
  await page.locator('input[name=first_name]').fill('Elena')
  await page.locator('input[name=last_name]').fill(apellido)
  await page.locator('input[name=birth_date]').fill('1992-04-10')
  await page.locator('select[name=gender]').selectOption('F')
  await page.getByRole('button', { name: /Guardar y Abrir Expediente/ }).click()

  await expect(page).toHaveURL(/\/dashboard\/patients\/[0-9a-f-]+\?creado=1/)
  await expect(page.getByText(`Elena ${apellido}`).first()).toBeVisible()

  await page.goto('/dashboard/patients')
  await expect(page.getByText(`Elena ${apellido}`).first()).toBeVisible()
})

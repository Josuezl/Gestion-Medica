import { test, expect } from '@playwright/test'
import { PASSWORD_E2E, USUARIOS_E2E } from './entorno'

test('credenciales buenas entran al dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('ejemplo@doctor.com').fill(USUARIOS_E2E.medico)
  await page.locator('input[type=password]').fill(PASSWORD_E2E)
  await page.getByRole('button', { name: 'Entrar al Sistema' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('Clínica de Prueba E2E').first()).toBeVisible()
})

test('contraseña mala muestra error y sigue en /login', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('ejemplo@doctor.com').fill(USUARIOS_E2E.medico)
  await page.locator('input[type=password]').fill('incorrecta-123')
  await page.getByRole('button', { name: 'Entrar al Sistema' }).click()
  await expect(page.getByText('Credenciales inválidas')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

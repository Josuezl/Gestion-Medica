import { test, expect } from './fixtures'
import { DEFAULT_LAB_CATALOG } from '../utils/labCatalog'
import { CLINICA_E2E, rest } from './rest'

test('una clínica sin catálogo de laboratorio recibe el estándar al abrir Catálogos', async ({ comoAdmin: page }) => {
  // Clínica sin catálogo (como una creada fuera del superadmin). Los exámenes caen en cascada.
  await rest(`lab_test_categories?clinic_id=eq.${CLINICA_E2E}`, { method: 'DELETE' })

  // Dos cargas a la vez: el índice único evita que el catálogo quede duplicado.
  const otra = await page.context().newPage()
  await Promise.all([page.goto('/dashboard/catalogos'), otra.goto('/dashboard/catalogos')])
  await otra.close()
  await expect(page.getByText(DEFAULT_LAB_CATALOG[0].category).first()).toBeVisible()

  const categorias = await rest(`lab_test_categories?select=id&clinic_id=eq.${CLINICA_E2E}`)
  const examenes = await rest(`lab_tests?select=id&clinic_id=eq.${CLINICA_E2E}`)
  expect(categorias).toHaveLength(DEFAULT_LAB_CATALOG.length)
  expect(examenes).toHaveLength(DEFAULT_LAB_CATALOG.reduce((n, c) => n + c.tests.length, 0))
})

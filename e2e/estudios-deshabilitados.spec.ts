import { test, expect } from './fixtures'
import { CLINICA_E2E, rest } from './rest'

// La subida de estudios está apagada para todos los tenants (utils/features.ts); «Estudios
// Solicitados» (las órdenes de estudios) sigue disponible.
test('el expediente ya no ofrece subir estudios', async ({ comoMedico: page }) => {
  const [paciente] = await rest(`patients?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.Ana`)
  await page.goto(`/dashboard/patients/${paciente.id}`)
  await expect(page.getByRole('button', { name: /Estudios Solicitados/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Estudios Médicos$/ })).toHaveCount(0)
  await expect(page.getByText('Subir Nuevo Estudio')).toHaveCount(0)
})

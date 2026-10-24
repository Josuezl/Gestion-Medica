import { test, expect } from './fixtures'

test('el asistente agenda una cita y el médico la ve sin recargar', async ({ comoAsistente: asistente, comoMedico: medico }, testInfo) => {
  await medico.goto('/dashboard')
  await expect(medico.getByRole('heading', { name: /citas|No hay citas/i }).first()).toBeAttached()
  const tarjetasMedico = medico.getByText('Ana Prueba Uno', { exact: true })
  const antes = await tarjetasMedico.count()

  await asistente.goto('/dashboard')
  await asistente.getByTitle('Nueva Cita').first().click()
  const formulario = asistente.locator('form').filter({ has: asistente.getByRole('button', { name: 'Agendar Cita' }) })
  await formulario.getByPlaceholder(/Buscar paciente/).fill('Ana')
  await formulario.getByText('Ana Prueba Uno', { exact: true }).click()
  // El formulario propone al primer médico de la lista (el admin también lo es): elegir al médico.
  await formulario.locator('select[name=doctor_id]').selectOption({ label: 'Dr. Médico Prueba' })
  // Hora propia por dispositivo; si igual choca con una cita previa, la app pide confirmar.
  await formulario.locator('input[name=time]').fill(testInfo.project.name === 'telefono' ? '10:00' : '09:00')
  asistente.on('dialog', (d) => void d.accept())
  await formulario.getByRole('button', { name: 'Agendar Cita' }).click()
  await expect(formulario).toBeHidden()

  // Sin recargar: llega por realtime (o por el respaldo de sondeo del canal).
  await expect(tarjetasMedico).toHaveCount(antes + 1, { timeout: 30_000 })
})

import { test, expect } from './fixtures'
import { CLINICA_E2E, rest } from './rest'

// «Consultas por médico» rotula con primer nombre + primer apellido (el completo se cortaba).
test('el reporte muestra el nombre corto del médico', async ({ comoMedico: page }) => {
  const [medico] = await rest(`user_profiles?select=id,first_name,last_name&clinic_id=eq.${CLINICA_E2E}&role=eq.DOCTOR`)
  const perfil = (body: object) => rest(`user_profiles?id=eq.${medico.id}`, { method: 'PATCH', body: JSON.stringify(body) })

  // Una consulta de hoy asegura que el médico salga en el reporte del día.
  const [paciente] = await rest(`patients?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.Ana`)
  await rest('consultations', {
    method: 'POST',
    body: JSON.stringify({ clinic_id: CLINICA_E2E, patient_id: paciente.id, doctor_id: medico.id, reason_for_visit: 'Reporte E2E', diagnosis: 'Control', treatment_plan: 'Seguimiento' }),
  })

  await perfil({ first_name: 'Manuel Armando', last_name: 'Espinoza Rueda' })
  try {
    await page.goto('/dashboard/reports')
    const grafica = page.locator('.recharts-cartesian-axis-tick').filter({ hasText: /Espinoza/ })
    await expect(grafica.first()).toHaveText('Dr. Manuel Espinoza')
    await expect(page.getByText('Manuel Armando Espinoza Rueda')).toHaveCount(0)
  } finally {
    await perfil({ first_name: medico.first_name, last_name: medico.last_name })
  }
})

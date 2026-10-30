import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { CLINICA_E2E, rest } from './rest'

const SEDE_E2E = '00000000-0000-4000-a000-000000000011'

// Paciente propio con antecedentes «de antes» (sin estado), para probar la deducción y el guardado.
async function prepararPaciente() {
  const filtro = `clinic_id=eq.${CLINICA_E2E}&first_name=eq.Tomas&last_name=eq.${encodeURIComponent('Antecedentes Prueba')}`
  let [p] = await rest(`patients?select=id&${filtro}`)
  if (!p) {
    ;[p] = await rest('patients', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ clinic_id: CLINICA_E2E, location_id: SEDE_E2E, first_name: 'Tomas', last_name: 'Antecedentes Prueba', gender: 'M', birth_date: '1975-03-03' }),
    })
  }
  await rest(`patients?id=eq.${p.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      allergies: 'Ninguna conocida', allergies_status: null,
      pathological_history: 'Niega', pathological_history_status: null,
      non_pathological_history: 'Estado civil: C', non_pathological_history_status: null,
      family_history: null, family_history_status: null,
    }),
  })
  // Una consulta anterior con signos, para el historial de «Otros signos vitales».
  const [medico] = await rest(`user_profiles?select=id&clinic_id=eq.${CLINICA_E2E}&role=eq.DOCTOR`)
  await rest('consultations', {
    method: 'POST',
    body: JSON.stringify({ clinic_id: CLINICA_E2E, patient_id: p.id, doctor_id: medico.id, reason_for_visit: 'Control', diagnosis: 'Sano', treatment_plan: 'Control', temperature: 36.7, weight: 72, heart_rate: 74, oxygen_saturation: 98 }),
  })
  return p.id as string
}

async function abrirConsulta(page: Page, id: string) {
  await page.goto(`/dashboard/consultations/new?patientId=${id}`)
  await page.getByRole('button', { name: /Continuar con la consulta/ }).first().click({ timeout: 4000 }).catch(() => {})
  await page.getByRole('button', { name: 'Descartar' }).click({ timeout: 2000 }).catch(() => {})
}

const campo = (page: Page, titulo: string) => page.locator('.ant-campo').filter({ hasText: titulo })

test('antecedentes: deduce lo anterior, exige detalle en Refiere y guarda el estado', async ({ comoMedico: page }) => {
  const id = await prepararPaciente()
  await abrirConsulta(page, id)

  // Deducción de registros sin estado.
  await expect(campo(page, 'Alergias').getByRole('radio', { name: 'Sin registrar' })).toBeChecked()
  await expect(campo(page, 'Antecedentes patológicos').getByRole('radio', { name: 'Niega' })).toBeChecked()
  await expect(campo(page, 'Antecedentes no patológicos').getByRole('radio', { name: 'Refiere' })).toBeChecked()
  await expect(campo(page, 'Antecedentes no patológicos').locator('textarea')).toHaveValue('Estado civil: C')

  // Historial de otros signos de la consulta anterior.
  const historial = page.getByRole('region', { name: 'Historial de otros signos vitales' })
  await expect(historial.locator('tbody tr').first()).toContainText('36.7')

  await page.locator('textarea[name=reason_for_visit]').fill('Control')
  await page.locator('[name=diagnosis]').fill('Sano')
  await page.locator('[name=treatment_plan]').fill('Control')

  // Refiere sin detalle: no deja guardar.
  await campo(page, 'Alergias').getByRole('radio', { name: 'Refiere' }).check()
  await expect(campo(page, 'Alergias').locator('textarea')).toBeFocused()
  const finalizar = page.getByRole('button', { name: /Finalizar Consulta/ })
  await finalizar.click()
  await expect(page.getByText('Escribe los detalles en «Alergias» o cambia la opción.')).toBeVisible()

  await campo(page, 'Alergias').locator('textarea').fill('Penicilina: urticaria')
  await campo(page, 'Antecedentes heredofamiliares').getByRole('radio', { name: 'Niega' }).check()
  await finalizar.click()
  await page.waitForURL(/\/dashboard\/patients\//)

  const [guardado] = await rest(`patients?select=allergies,allergies_status,pathological_history_status,family_history,family_history_status&id=eq.${id}`)
  expect(guardado).toEqual({
    allergies: 'Penicilina: urticaria', allergies_status: 'refiere',
    pathological_history_status: 'niega',
    family_history: null, family_history_status: 'niega',
  })
  await expect(page.getByText('Penicilina: urticaria').first()).toBeVisible()
})

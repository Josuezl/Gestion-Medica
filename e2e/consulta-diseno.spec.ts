import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { CLINICA_E2E, rest } from './rest'

// Paciente propio de esta spec, con una consulta anterior (exámenes y signos) sembrada por REST.
const SEDE_E2E = '00000000-0000-4000-a000-000000000011'
const NOMBRE = 'Diana'
const APELLIDO = 'Diseno Prueba'

async function prepararPaciente(): Promise<string> {
  let [paciente] = await rest(`patients?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.${NOMBRE}&last_name=eq.${encodeURIComponent(APELLIDO)}`)
  if (!paciente) {
    ;[paciente] = await rest('patients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        clinic_id: CLINICA_E2E, location_id: SEDE_E2E, first_name: NOMBRE, last_name: APELLIDO,
        gender: 'F', birth_date: '1990-05-01', allergies: 'Niega', allergies_status: 'niega',
      }),
    })
    const [medico] = await rest(`user_profiles?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.${encodeURIComponent('Médico')}`)
    await rest('consultations', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: CLINICA_E2E, patient_id: paciente.id, doctor_id: medico.id, created_at: '2026-01-15T15:00:00Z',
        reason_for_visit: 'Control', diagnosis: 'Sano', treatment_plan: 'Nada',
        physical_exam: 'HEMOGRAMA NORMAL (ENERO)', blood_pressure: '118/76', temperature: 36.5, heart_rate: 70,
      }),
    })
  }
  return paciente.id
}

async function abrirConsulta(page: Page, pacienteId: string) {
  await page.goto(`/dashboard/consultations/new?patientId=${pacienteId}`)
  await page.getByRole('button', { name: /Continuar con la consulta/ }).first().click({ timeout: 4000 }).catch(() => {})
  await page.getByRole('button', { name: 'Descartar' }).click({ timeout: 2000 }).catch(() => {})
}

test('nueva consulta: histórico de exámenes, farmacias e incapacidad/referencia con campos', async ({ comoMedico: page }) => {
  const pacienteId = await prepararPaciente()
  await abrirConsulta(page, pacienteId)

  await expect(page.getByRole('heading', { name: 'Nueva consulta clínica' })).toBeVisible()

  // Histórico de exámenes de consultas anteriores
  await page.getByRole('button', { name: /Ver histórico de exámenes/ }).click()
  const modal = page.getByRole('dialog', { name: /Histórico de exámenes/ })
  await expect(modal.getByText('HEMOGRAMA NORMAL (ENERO)')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()

  // Farmacias junto a la receta
  await expect(page.getByRole('link', { name: /Kielsa/ })).toHaveAttribute('href', 'https://kielsa.com/')

  // Apagadas por defecto: sin campos
  await expect(page.locator('input[name=leave_days]')).toHaveCount(0)
  await expect(page.locator('input[name=referral_to]')).toHaveCount(0)

  await page.locator('textarea[name=reason_for_visit]').fill('Gripe')
  await page.locator('[name=diagnosis]').fill('Resfriado común')
  await page.locator('[name=treatment_plan]').fill('Reposo e hidratación')

  await page.getByRole('switch', { name: /Incluir incapacidad médica/ }).check({ force: true })
  await page.locator('input[name=leave_start_date]').fill('2026-11-02')
  await page.locator('input[name=leave_days]').fill('3')
  await expect(page.getByText('04/11/2026')).toBeVisible()
  await expect(page.getByText('3 días, del lunes 2 de noviembre al miércoles 4 de noviembre, ambas fechas inclusive.')).toBeVisible()
  // El diagnóstico no se copia solo: se toma de la consulta con el botón.
  await expect(page.locator('input[name=leave_diagnosis]')).toHaveValue('')
  await page.getByRole('button', { name: 'Usar el de la consulta' }).click()
  await expect(page.locator('input[name=leave_diagnosis]')).toHaveValue('Resfriado común')
  await page.locator('textarea[name=medical_leave]').fill('Reposo en casa')

  await page.getByRole('switch', { name: /Incluir referencia médica/ }).check({ force: true })
  await page.locator('input[name=referral_to]').fill('Otorrinolaringología')
  await page.locator('textarea[name=referral]').fill('Sinusitis recurrente')

  await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
  await expect(page.getByRole('button', { name: /Imprimir Incapacidad/ })).toBeVisible()

  const [consulta] = await rest(`consultations?select=id,leave_start_date,leave_days,leave_diagnosis,leave_issued_at,medical_leave,referral_to,referral&patient_id=eq.${pacienteId}&order=created_at.desc&limit=1`)
  expect(consulta.leave_issued_at).toBeTruthy()
  expect(consulta).toMatchObject({
    leave_start_date: '2026-11-02', leave_days: 3, leave_diagnosis: 'Resfriado común', medical_leave: 'Reposo en casa',
    referral_to: 'Otorrinolaringología', referral: 'Sinusitis recurrente',
  })

  await page.goto(`/consultations/${consulta.id}/print`)
  await expect(page.getByRole('heading', { name: 'Constancia médica de incapacidad', exact: true })).toBeVisible()
  await expect(page.getByText('3 días calendario')).toBeVisible()
  await expect(page.getByText('02/11/2026')).toBeVisible()
  await expect(page.getByText('04/11/2026')).toBeVisible()
  // Paciente sin DNI: aviso en pantalla y nunca «N/A» en la hoja.
  await expect(page.getByText(/Falta el número de identidad/)).toBeVisible()
  await expect(page.getByText('N/A')).toHaveCount(0)
  await expect(page.getByText(/\.\.$/)).toHaveCount(0)
  await page.goto(`/consultations/${consulta.id}/print?doc=referral`)
  await expect(page.getByText('Otorrinolaringología')).toBeVisible()
})

test('expediente: encabezado nuevo y signos de la consulta en el detalle', async ({ comoMedico: page }) => {
  const pacienteId = await prepararPaciente()
  await page.goto(`/dashboard/patients/${pacienteId}`)

  await expect(page.getByRole('link', { name: /Nueva consulta/ })).toBeVisible()
  await expect(page.getByText('Alergias:')).toBeVisible()
  await page.getByRole('button', { name: /Documentos/ }).click()
  await expect(page.getByRole('menuitem', { name: /Imprimir ficha/ })).toBeVisible()
  await page.keyboard.press('Escape')

  // Sin chips de signos en la tarjeta; dentro del detalle, con sus históricos
  await expect(page.locator('.vital-chips')).toHaveCount(0)
  await page.locator('.consulta-tarjeta').first().click()
  // Solo los signos de esa consulta, sin tablas de históricos.
  const signos = page.getByRole('region', { name: 'Signos vitales de la consulta' }).first()
  await expect(signos).toBeVisible()
  await expect(signos.getByText(/Históricos/)).toHaveCount(0)
})

test('el filtro de doctor se mantiene al ir y volver del dashboard', async ({ comoAsistente: page }) => {
  await page.goto('/dashboard')
  const filtro = page.locator('.filter-group select').first()
  await filtro.selectOption({ label: 'Dr. Médico Prueba' })
  const elegido = await filtro.inputValue()

  await page.goto('/dashboard/patients')
  await page.goBack()
  await expect(filtro).toHaveValue(elegido)

  await page.reload()
  await expect(filtro).toHaveValue(elegido)
})

test('farmacias: en escritorio abren en una ventana al costado, sin vínculo con la consulta', async ({ comoMedico: page }, testInfo) => {
  // Sin salir a internet: se responde una página falsa por cada farmacia.
  await page.context().route(/farmaciasdelahorro\.hn|farmaciasiman\.com|kielsa\.com/, (r) =>
    r.fulfill({ contentType: 'text/html', body: '<title>farmacia</title>' }))
  const pacienteId = await prepararPaciente()
  await abrirConsulta(page, pacienteId)
  const urlConsulta = page.url()

  const [ventana] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: /Simán/ }).click()])
  await expect(ventana).toHaveURL(/farmaciasiman\.com/)
  expect(page.url()).toBe(urlConsulta)
  // La farmacia no puede tocar la pestaña de la consulta.
  expect(await ventana.evaluate(() => window.opener)).toBeNull()
  if (testInfo.project.name === 'escritorio') {
    // Ventana aparte del tamaño pedido, no una pestaña del tamaño de la consulta.
    expect(await ventana.evaluate(() => window.outerWidth)).toBeLessThanOrEqual(1000)
  }
})

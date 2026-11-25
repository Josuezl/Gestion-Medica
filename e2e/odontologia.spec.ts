import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { SEDE_E2E } from './entorno'
import { test as base, expect } from './fixtures'
import { CLINICA_E2E, rest } from './rest'

const RUTA_GUARDADO = '/api/guardar/consulta-dental'
const CARA_OCLUSAL = 'Pieza 36, cara oclusal'
const DIAGNOSTICO_DENTAL = 'Caries oclusal en la pieza 36'

async function cambiarLicencia(habilitada: boolean) {
  const clinicas = await rest(`clinics?id=eq.${CLINICA_E2E}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ odontologia_habilitada: habilitada }),
  })
  expect(clinicas).toMatchObject([{ odontologia_habilitada: habilitada }])
}

const test = base.extend<{ paciente: { id: string; medico: Page }; medicoSinLicencia: Page }>({
  paciente: async ({ comoMedico }, usar) => {
    const id = randomUUID()
    await rest('patients', {
      method: 'POST',
      body: JSON.stringify({
        id, clinic_id: CLINICA_E2E, location_id: SEDE_E2E,
        first_name: 'Paciente', last_name: 'Odontología E2E', gender: 'F', birth_date: '1990-05-01',
      }),
    })
    try {
      await usar({ id, medico: comoMedico })
    } finally {
      await rest(`consultations?patient_id=eq.${id}&clinic_id=eq.${CLINICA_E2E}`, { method: 'DELETE' })
      await rest(`patients?id=eq.${id}&clinic_id=eq.${CLINICA_E2E}`, { method: 'DELETE' })
    }
  },
  medicoSinLicencia: async ({ comoMedico }, usar) => {
    // La configuración ejecuta un solo worker. El teardown restaura la licencia incluso si falla la prueba.
    try {
      await cambiarLicencia(false)
      await usar(comoMedico)
    } finally {
      await cambiarLicencia(true)
    }
  },
})

async function afirmarGuardadoDentalRechazado(page: Page, pacienteId: string) {
  await page.goto('/dashboard/profile')
  await expect(page).toHaveURL('/dashboard/profile')
  const respuesta = await page.request.post(RUTA_GUARDADO, {
    multipart: {
      _patientId: pacienteId,
      _medicines: '[]',
      _denticion: 'PERMANENTE',
      _odontograma: JSON.stringify({ version: 1, piezas: {}, regiones: {} }),
      reason_for_visit: 'Control dental',
      diagnosis: DIAGNOSTICO_DENTAL,
      treatment_plan: 'Restauración',
    },
  })
  expect(respuesta.status()).toBe(200)
  expect(await respuesta.json()).toEqual({ error: 'Solo los odontólogos pueden guardar consultas dentales.' })
  expect(await rest(`consultations?select=id&patient_id=eq.${pacienteId}`)).toEqual([])
}

test('el odontólogo abre una consulta dental desde la lista de pacientes', async ({ comoOdontologo, paciente }) => {
  await comoOdontologo.goto('/dashboard/patients?q=Paciente+Odontolog%C3%ADa+E2E')
  const fila = comoOdontologo.getByRole('row').filter({
    has: comoOdontologo.getByRole('link', { name: 'Expediente', exact: true })
      .and(comoOdontologo.locator(`[href="/dashboard/patients/${paciente.id}"]`)),
  })
  const dental = fila.getByRole('link', { name: 'Consulta dental', exact: true })
  const medica = fila.getByRole('link', { name: 'Consulta médica', exact: true })
  await expect(dental).toHaveClass(/\bbtn-secondary\b/)
  await expect(medica).toHaveClass(/\bbtn-secondary\b/)
  await expect(medica).toHaveAttribute('href', `/dashboard/consultations/new?patientId=${paciente.id}`)
  // Primero la consulta médica y después la dental (pedido de Josué).
  expect(await medica.evaluate((m, d) => Boolean(m.compareDocumentPosition(d!) & Node.DOCUMENT_POSITION_FOLLOWING), await dental.elementHandle())).toBe(true)
  await dental.click()
  await expect(comoOdontologo).toHaveURL(`/dashboard/odontologia/consulta/nueva?patientId=${paciente.id}`)
  await expect(comoOdontologo.getByRole('heading', { name: 'Nueva consulta dental', exact: true })).toBeVisible()
})

test('el expediente muestra el odontograma vacío en solo lectura y permite iniciar una consulta dental', async ({ comoOdontologo, paciente }) => {
  await comoOdontologo.goto(`/dashboard/patients/${paciente.id}`)
  const dental = comoOdontologo.getByRole('link', { name: 'Consulta dental', exact: true })
  const medica = comoOdontologo.getByRole('link', { name: 'Consulta médica', exact: true })
  await expect(dental).toHaveCount(2)
  await expect(medica).toHaveCount(2)
  for (const enlace of await dental.all()) {
    await expect(enlace).toHaveClass(/\bbtn-secondary\b/)
    await expect(enlace).toHaveAttribute('href', `/dashboard/odontologia/consulta/nueva?patientId=${paciente.id}`)
  }
  for (const enlace of await medica.all()) {
    await expect(enlace).toHaveClass(/\bbtn-secondary\b/)
    await expect(enlace).toHaveAttribute('href', `/dashboard/consultations/new?patientId=${paciente.id}`)
  }

  await comoOdontologo.getByRole('button', { name: 'Odontograma', exact: true }).click()
  await expect(comoOdontologo.getByText('Este paciente todavía no tiene odontogramas guardados.')).toBeVisible()
  const odontograma = comoOdontologo.getByRole('region', { name: 'Odontograma', exact: true })
  await expect(odontograma).toBeVisible()
  await expect(odontograma.getByRole('group', { name: 'Arcada superior permanente' })).toBeVisible()
  await expect(odontograma.getByRole('group', { name: 'Arcada superior temporal' })).toHaveCount(0)
  const cara = odontograma.getByRole('button', { name: CARA_OCLUSAL, exact: true })
  await expect(cara).toBeDisabled()
  await expect(cara).toHaveAccessibleDescription(CARA_OCLUSAL)
  const nueva = comoOdontologo.getByRole('link', { name: 'Nueva consulta dental', exact: true })
  await expect(nueva).toBeVisible()
  await expect(nueva).toHaveClass(/\bbtn-primary\b/)
  await expect(nueva).toHaveAttribute('href', `/dashboard/odontologia/consulta/nueva?patientId=${paciente.id}`)
})

test('la consulta dental queda en el expediente, el historial médico y el reporte para el paciente', async ({ comoOdontologo, paciente }) => {
  const expediente = `/dashboard/patients/${paciente.id}`
  const consultaId = await test.step('El odontólogo guarda una caries oclusal pendiente en la pieza 36', async () => {
    await comoOdontologo.goto(`/dashboard/odontologia/consulta/nueva?patientId=${paciente.id}`)
    await comoOdontologo.locator('[name=reason_for_visit]').fill('Dolor al masticar')
    await comoOdontologo.locator('[name=diagnosis]').fill(DIAGNOSTICO_DENTAL)
    await comoOdontologo.locator('[name=treatment_plan]').fill('Restauración')

    await comoOdontologo.getByRole('button', { name: CARA_OCLUSAL, exact: true }).click()
    const editor = comoOdontologo.getByRole('dialog', { name: CARA_OCLUSAL })
    await editor.getByRole('radio', { name: 'Caries', exact: true }).click()
    await editor.getByLabel('Estado').selectOption('PENDIENTE')
    await editor.getByRole('button', { name: 'Aplicar' }).click()

    await comoOdontologo.getByRole('button', { name: 'Pieza 18', exact: true }).click()
    const pieza = comoOdontologo.getByRole('dialog', { name: 'Pieza 18' })
    await pieza.getByRole('radio', { name: 'Corona', exact: true }).click()
    await pieza.getByLabel('Estado').selectOption('REALIZADO')
    await pieza.getByRole('button', { name: 'Aplicar' }).click()
    const [respuesta] = await Promise.all([
      comoOdontologo.waitForResponse((r) => new URL(r.url()).pathname === RUTA_GUARDADO && r.request().method() === 'POST'),
      comoOdontologo.getByRole('button', { name: 'Finalizar consulta dental' }).click(),
    ])
    expect(respuesta.ok()).toBe(true)
    const guardado = await respuesta.json()
    expect(guardado).toMatchObject({ success: true, consultationId: expect.any(String) })
    const impresion = `/consultations/${guardado.consultationId}/print`
    const reporte = comoOdontologo.getByRole('link', { name: 'Imprimir reporte para el paciente', exact: true })
    await expect(reporte).toHaveAttribute('href', `${impresion}/plan-trabajo`)
    await expect(reporte).toHaveAttribute('target', '_blank')
    await expect(comoOdontologo.getByRole('link', { name: 'Imprimir consulta', exact: true })).toHaveAttribute('href', `${impresion}?doc=dental`)
    await comoOdontologo.getByRole('link', { name: 'Ir al expediente', exact: true }).click()
    await expect(comoOdontologo).toHaveURL(expediente)
    await expect(comoOdontologo.locator('.consulta-tarjeta').getByText('Odontología', { exact: true })).toBeVisible()
    return guardado.consultationId as string
  })

  await test.step('El médico ve la consulta en el historial y el odontograma en solo lectura', async () => {
    const { medico } = paciente
    await medico.goto(`/dashboard/consultations/new?patientId=${paciente.id}`)
    await expect(medico.getByRole('heading', { name: 'Resumen del Expediente' })).toBeVisible()
    await expect(medico.getByText('Odontología', { exact: true }).and(medico.locator('.badge')).first()).toBeVisible()
    await expect(medico.getByText(DIAGNOSTICO_DENTAL, { exact: true }).first()).toBeVisible()

    await medico.goto(expediente)
    await medico.getByRole('button', { name: 'Odontograma', exact: true }).click()
    const odontograma = medico.getByRole('region', { name: 'Odontograma', exact: true })
    const cara = odontograma.getByRole('button', { name: CARA_OCLUSAL, exact: true })
    await expect(cara).toBeDisabled()
    await expect(cara).toHaveAccessibleDescription('Caries · Pendiente')
    await expect(medico.getByRole('link', { name: 'Nueva consulta dental' })).toHaveCount(0)
    await expect(medico.getByRole('button', { name: 'Nueva consulta dental' })).toHaveCount(0)
  })

  await test.step('El reporte incluye los trabajos realizados y pendientes con su código de verificación', async () => {
    await paciente.medico.goto(`/consultations/${consultaId}/print/plan-trabajo`)
    await expect(paciente.medico.getByRole('heading', { name: 'Consulta y plan de tratamiento', exact: true })).toBeVisible()
    const realizados = paciente.medico.getByRole('region', { name: 'Realizado en esta consulta' })
    const pendientes = paciente.medico.getByRole('region', { name: 'Plan de trabajo' })
    await expect(realizados.getByRole('row').filter({ hasText: 'Corona' }).getByRole('cell', { name: '18', exact: true })).toBeVisible()
    const fila = pendientes.getByRole('row').filter({
      has: paciente.medico.getByRole('cell', { name: '36', exact: true }),
    })
    await expect(fila.getByRole('cell', { name: 'Oclusal', exact: true })).toBeVisible()
    await expect(fila.getByRole('cell', { name: 'Caries', exact: true })).toBeVisible()
    await expect(paciente.medico.getByRole('img', { name: 'Código QR de verificación del documento' })).toBeVisible()
    const [{ verification_code }] = await rest(`consultations?select=verification_code&id=eq.${consultaId}`)
    await expect(paciente.medico.locator('.qr-code')).toHaveText(verification_code)
    await paciente.medico.goto(`/verificar/${verification_code}?doc=dental`)
    await expect(paciente.medico.getByText('Paciente Odontología E2E', { exact: true })).toBeVisible()
    await expect(paciente.medico.getByText(DIAGNOSTICO_DENTAL, { exact: true })).toHaveCount(0)
  })
})

test('el médico recibe un error al llamar directamente a la ruta de guardado dental', async ({ paciente }) => {
  await afirmarGuardadoDentalRechazado(paciente.medico, paciente.id)
})

test('con la licencia apagada el menú se oculta y el odontólogo no puede guardar', async ({ medicoSinLicencia, comoOdontologo, paciente }) => {
  await medicoSinLicencia.goto('/dashboard')
  const menu = medicoSinLicencia.locator('nav')
  await expect(menu.getByRole('link', { name: 'Pacientes', exact: true, includeHidden: true })).toHaveCount(1)
  await expect(menu.getByRole('link', { name: 'Odontología', exact: true, includeHidden: true })).toHaveCount(0)
  await afirmarGuardadoDentalRechazado(comoOdontologo, paciente.id)
})

test('el médico sigue guardando consultas médicas', async ({ paciente: { id, medico } }) => {
  await medico.goto(`/dashboard/consultations/new?patientId=${id}`)
  await expect(medico.getByRole('heading', { name: 'Nueva consulta clínica' })).toBeVisible()
  await medico.locator('[name=reason_for_visit]').fill('Gripe')
  await medico.locator('[name=diagnosis]').fill('Resfriado común')
  await medico.locator('[name=treatment_plan]').fill('Reposo e hidratación')
  await medico.getByRole('button', { name: 'Finalizar Consulta' }).click()
  await expect(medico).toHaveURL(`/dashboard/patients/${id}`)
  expect(await rest(`consultations?select=tipo,diagnosis&patient_id=eq.${id}`)).toEqual([
    { tipo: 'MEDICA', diagnosis: 'Resfriado común' },
  ])
})

test('la sección Odontología lista solo consultas dentales y abre el expediente en el odontograma', async ({ comoOdontologo, paciente }) => {
  const [odontologo] = await rest(`user_profiles?select=id&clinic_id=eq.${CLINICA_E2E}&is_dentist=eq.true&limit=1`) as { id: string }[]
  const base = { clinic_id: CLINICA_E2E, patient_id: paciente.id, doctor_id: odontologo.id, treatment_plan: 'Control' }
  await rest('consultations', {
    method: 'POST',
    body: JSON.stringify([
      { ...base, tipo: 'DENTAL', reason_for_visit: 'Limpieza dental E2E', diagnosis: 'Gingivitis leve E2E' },
      { ...base, tipo: 'MEDICA', reason_for_visit: 'Gripe E2E', diagnosis: 'Resfriado común E2E' },
    ]),
  })

  await comoOdontologo.goto('/dashboard/odontologia?q=Odontolog%C3%ADa+E2E')
  await expect(comoOdontologo.getByRole('heading', { name: 'Consultas odontológicas', exact: true })).toBeVisible()
  await expect(comoOdontologo.getByRole('link', { name: 'Nueva consulta dental (Buscar paciente)' })).toBeVisible()
  await expect(comoOdontologo.getByText('Gingivitis leve E2E')).toBeVisible()
  await expect(comoOdontologo.getByText('Resfriado común E2E')).toHaveCount(0)

  await comoOdontologo.getByRole('link', { name: 'Expediente' }).first().click()
  await expect(comoOdontologo).toHaveURL(`/dashboard/patients/${paciente.id}?tab=odontograma`)
  await expect(comoOdontologo.getByRole('region', { name: 'Odontograma', exact: true })).toBeVisible()
})

test('la consulta dental solicita una radiografía panorámica y emite incapacidad', async ({ comoOdontologo, paciente }) => {
  await comoOdontologo.goto(`/dashboard/odontologia/consulta/nueva?patientId=${paciente.id}`)
  await comoOdontologo.locator('[name=reason_for_visit]').fill('Dolor en molar')
  await comoOdontologo.locator('[name=diagnosis]').fill('Pulpitis en la pieza 46')
  await comoOdontologo.locator('[name=treatment_plan]').fill('Endodoncia de la pieza 46')

  // El historial de consultas vive en un botón con modal.
  await comoOdontologo.getByRole('button', { name: /Historial de consultas/ }).click()
  const historial = comoOdontologo.getByRole('dialog', { name: 'Historial de consultas' })
  await expect(historial).toBeVisible()
  await historial.getByRole('button', { name: 'Cerrar historial' }).click()

  await comoOdontologo.getByRole('button', { name: 'Seleccionar estudios' }).click()
  await comoOdontologo.getByText('Radiografía panorámica', { exact: true }).first().click()
  await comoOdontologo.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(comoOdontologo.getByText('1 estudio seleccionado')).toBeVisible()

  await comoOdontologo.getByRole('switch', { name: 'Incluir incapacidad' }).check({ force: true })
  await comoOdontologo.locator('[name=leave_days]').fill('2')
  await comoOdontologo.locator('[name=leave_diagnosis]').fill('Pulpitis en la pieza 46')
  await comoOdontologo.locator('[name=medical_leave]').fill('Reposo relativo')
  await comoOdontologo.getByRole('button', { name: 'Finalizar consulta dental' }).click()

  const estudios = comoOdontologo.getByRole('link', { name: 'Imprimir solicitud de estudios' })
  await expect(estudios).toBeVisible()
  await expect(comoOdontologo.getByRole('link', { name: 'Imprimir incapacidad' })).toBeVisible()
  await expect(comoOdontologo.getByRole('link', { name: 'Imprimir consulta' })).toHaveAttribute('href', /\?doc=dental$/)

  const [consulta] = await rest(`consultations?select=leave_days,medical_leave,tipo&patient_id=eq.${paciente.id}`) as
    { leave_days: number; medical_leave: string; tipo: string }[]
  expect(consulta).toMatchObject({ tipo: 'DENTAL', leave_days: 2, medical_leave: 'Reposo relativo' })
  const solicitudes = await rest(`study_requests?select=studies&patient_id=eq.${paciente.id}`) as { studies: { name: string }[] }[]
  expect(solicitudes[0].studies.map((e) => e.name)).toContain('Radiografía panorámica')
  await rest(`study_requests?patient_id=eq.${paciente.id}`, { method: 'DELETE' })
})

test('el administrador puede guardar una consulta dental aunque no sea odontólogo', async ({ comoAdmin, paciente }) => {
  await comoAdmin.goto(`/dashboard/patients/${paciente.id}`)
  await expect(comoAdmin.getByRole('link', { name: 'Consulta dental', exact: true }).first()).toBeVisible()
  const respuesta = await comoAdmin.request.post(RUTA_GUARDADO, {
    multipart: {
      _patientId: paciente.id,
      _medicines: '[]',
      _denticion: 'PERMANENTE',
      _odontograma: JSON.stringify({ version: 1, piezas: {}, regiones: {} }),
      reason_for_visit: 'Control dental',
      diagnosis: DIAGNOSTICO_DENTAL,
      treatment_plan: 'Restauración',
    },
  })
  expect(await respuesta.json()).toMatchObject({ success: true, consultationId: expect.any(String) })
})

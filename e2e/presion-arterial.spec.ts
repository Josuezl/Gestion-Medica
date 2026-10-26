import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { CLINICA_E2E, rest } from './rest'

// La clínica de prueba hace de «Centro Neurológico»: se activa require_bp_arm solo durante este archivo.
const SEDE_E2E = '00000000-0000-4000-a000-000000000011'

// Pacientes propios de este archivo: las consultas que guarda no deben cambiar lo que ven otras
// pruebas (con historial, Nueva Consulta abre el «Resumen del Expediente»).
const PACIENTES = [
  { first_name: 'Pedro', last_name: 'Presion Uno', gender: 'M', birth_date: '1970-05-10', is_pediatric: false },
  { first_name: 'Paula', last_name: 'Presion Dos', gender: 'F', birth_date: '1965-09-21', is_pediatric: false },
  { first_name: 'Pablo', last_name: 'Presion Nino', gender: 'M', birth_date: '2019-02-14', is_pediatric: true },
]

const exigirBrazo = (valor: boolean) =>
  rest(`clinics?id=eq.${CLINICA_E2E}`, { method: 'PATCH', body: JSON.stringify({ require_bp_arm: valor }) })

// La lista se busca por nombre: sin filtro, los pacientes que crean otras corridas la llenan.
const listaFiltrada = (paciente: RegExp) => `/dashboard/patients?q=${encodeURIComponent(paciente.source.split(' ')[0])}`

async function abrirConsulta(page: Page, paciente: RegExp) {
  await page.goto(listaFiltrada(paciente))
  await page.getByRole('row', { name: paciente }).getByRole('link', { name: 'Consulta' }).click()
  await page.waitForURL(/\/dashboard\/consultations\/new\?patientId=/)
  // Con consultas previas sale el «Resumen del Expediente» (tapa el formulario) y puede quedar un
  // borrador de otra corrida: se esperan un momento en vez de mirar una sola vez.
  const continuar = page.getByRole('button', { name: /Continuar con la consulta/ }).first() // el modal trae dos
  await continuar.click({ timeout: 4000 }).catch(() => {})
  const descartar = page.getByRole('button', { name: 'Descartar' })
  await descartar.click({ timeout: 2000 }).catch(() => {})
  await page.locator('textarea[name=reason_for_visit]').fill('Control de presión')
  await page.locator('[name=diagnosis]').fill('Hipertensión en control')
  await page.locator('[name=treatment_plan]').fill('Continuar tratamiento')
}

async function ultimaConsulta(nombre: string) {
  const [paciente] = await rest(`patients?select=id&first_name=eq.${encodeURIComponent(nombre)}&clinic_id=eq.${CLINICA_E2E}`)
  const [consulta] = await rest(`consultations?select=blood_pressure,blood_pressure_left,blood_pressure_right&patient_id=eq.${paciente.id}&order=created_at.desc&limit=1`)
  return consulta
}

test.describe('presión arterial por brazo', () => {
  test.beforeAll(async () => {
    await exigirBrazo(true)
    for (const p of PACIENTES) {
      const existe = await rest(`patients?select=id&clinic_id=eq.${CLINICA_E2E}&first_name=eq.${p.first_name}&last_name=eq.${encodeURIComponent(p.last_name)}`)
      if (existe.length === 0) {
        await rest('patients', { method: 'POST', body: JSON.stringify({ ...p, clinic_id: CLINICA_E2E, location_id: SEDE_E2E }) })
      }
    }
    // Una pre-clínica pendiente de una corrida anterior precargaría la presión en la consulta.
    await rest(`preclinical_vitals?clinic_id=eq.${CLINICA_E2E}&consumed_at=is.null`, {
      method: 'PATCH', body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    })
  })
  test.afterAll(() => exigirBrazo(false))

  test('adulto en clínica que la exige: pide la presión; guarda ambos brazos', async ({ comoMedico: page }) => {
    await abrirConsulta(page, /Pedro Presion Uno/)
    const finalizar = page.getByRole('button', { name: /Finalizar Consulta/ })

    await finalizar.click()
    await expect(page.getByText('La presión arterial es obligatoria para pacientes adultos.')).toBeVisible()

    await page.getByLabel('Lectura (mmHg)').fill('120/80')

    // Ambos brazos: desaparece el selector y aparece el campo del brazo derecho.
    await page.getByLabel('Tomar en ambos brazos').check()
    await expect(page.getByRole('radio', { name: 'Izquierdo' })).toBeHidden()
    await page.getByLabel('Brazo derecho (mmHg)').fill('125/82')
    await finalizar.click()
    await page.waitForURL(/\/dashboard\/patients\//)

    expect(await ultimaConsulta('Pedro')).toEqual({
      blood_pressure: '120/80', blood_pressure_left: '120/80', blood_pressure_right: '125/82',
    })
    await expect(page.locator('.vital-chip', { hasText: 'PA izq.' }).filter({ hasText: '120/80' }).first()).toBeVisible()
    await expect(page.locator('.vital-chip', { hasText: 'PA der.' }).filter({ hasText: '125/82' }).first()).toBeVisible()
  })

  test('adulto: un solo brazo queda en su columna', async ({ comoMedico: page }) => {
    await abrirConsulta(page, /Paula Presion Dos/)
    await page.getByLabel('Lectura (mmHg)').fill('130/85')
    await page.getByRole('radio', { name: 'Derecho' }).check()
    await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
    await page.waitForURL(/\/dashboard\/patients\//)

    expect(await ultimaConsulta('Paula')).toEqual({
      blood_pressure: '130/85', blood_pressure_left: null, blood_pressure_right: '130/85',
    })
  })

  test('adulto: el brazo es opcional, se guarda solo la lectura', async ({ comoMedico: page }) => {
    await abrirConsulta(page, /Paula Presion Dos/)
    await page.getByLabel('Lectura (mmHg)').fill('126/82')
    await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
    await page.waitForURL(/\/dashboard\/patients\//)

    expect(await ultimaConsulta('Paula')).toEqual({
      blood_pressure: '126/82', blood_pressure_left: null, blood_pressure_right: null,
    })
  })

  test('Nueva Consulta muestra el historial de tomas del paciente', async ({ comoMedico: page }) => {
    // Paula ya tiene dos consultas de este archivo: 126/82 sin brazo (la más reciente) y 130/85 derecho.
    await abrirConsulta(page, /Paula Presion Dos/)
    const historial = page.getByRole('region', { name: 'Historial de presión arterial' })
    await expect(historial).toBeVisible()
    const filas = historial.locator('tbody tr')
    await expect(filas.first().locator('td').nth(1)).toHaveText('126/82')
    await expect(historial.locator('td', { hasText: '130/85' }).first()).toBeVisible()
    await expect(historial.locator('.bp-nivel-elevada').first()).toBeVisible()
  })

  test('pre-clínica: también la exige, y el brazo llega a la consulta', async ({ comoMedico: page }) => {
    await page.goto(listaFiltrada(/Pedro Presion Uno/))
    await page.getByRole('row', { name: /Pedro Presion Uno/ }).getByRole('button', { name: /Tomar signos/ }).click()
    const guardar = page.getByRole('button', { name: 'Guardar signos' })

    await guardar.click()
    await expect(page.getByText('La presión arterial es obligatoria para pacientes adultos.')).toBeVisible()

    await page.getByLabel('Lectura (mmHg)').fill('118/76')
    await page.getByRole('radio', { name: 'Izquierdo' }).check()
    await guardar.click()
    await expect(guardar).toBeHidden()

    // La consulta abre con la lectura y el brazo de la pre-clínica; al guardarla se consume.
    await abrirConsulta(page, /Pedro Presion Uno/)
    await expect(page.getByLabel('Lectura (mmHg)')).toHaveValue('118/76')
    await expect(page.getByRole('radio', { name: 'Izquierdo' })).toBeChecked()
    await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
    await page.waitForURL(/\/dashboard\/patients\//)
    expect(await ultimaConsulta('Pedro')).toEqual({
      blood_pressure: '118/76', blood_pressure_left: '118/76', blood_pressure_right: null,
    })
  })

  test('paciente pediátrico: la presión no es obligatoria', async ({ comoMedico: page }) => {
    await abrirConsulta(page, /Pablo Presion Nino/)
    await expect(page.getByText('Obligatoria en adultos')).toHaveCount(0)
    await page.getByRole('button', { name: /Finalizar Consulta/ }).click()
    await page.waitForURL(/\/dashboard\/patients\//)
  })
})

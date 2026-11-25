import { execFileSync } from 'node:child_process'
import { chromium, type FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { validarEntornoE2e } from './guardia-entorno'
import { PASSWORD_E2E, SEDE_E2E, USUARIOS_E2E, archivoSesion, statusSupabaseLocal, type RolE2e } from './entorno'
import { CLINICA_E2E } from './rest'

async function sembrarOdontologia(status: Record<string, string>) {
  const opciones = { auth: { autoRefreshToken: false, persistSession: false } }
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, opciones)
  const cliente = createClient(status.API_URL, status.ANON_KEY, opciones)
  const email = USUARIOS_E2E.odontologo
  const password = PASSWORD_E2E
  const { data: sesion } = await cliente.auth.signInWithPassword({ email, password })
  let id = sesion.user?.id

  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw new Error(`${email}: ${error.message}`)
    id = data.user.id
  }

  const { error: perfilError } = await admin.from('user_profiles').upsert({
    id,
    clinic_id: CLINICA_E2E,
    default_location_id: SEDE_E2E,
    first_name: 'Odontólogo',
    last_name: 'Prueba',
    role: 'DOCTOR',
    specialty: 'Cirujano Dentista',
    is_org_admin: false,
    is_dentist: true,
  })
  if (perfilError) throw new Error(`Perfil de ${email}: ${perfilError.message}`)

  const { error: licenciaError } = await admin.from('clinics')
    .update({ odontologia_habilitada: true }).eq('id', CLINICA_E2E).select('id').single()
  if (licenciaError) throw new Error(`Licencia de odontología E2E: ${licenciaError.message}`)
}

export default async function globalSetup(config: FullConfig) {
  // 1. El candado va PRIMERO: nada se crea si la base no es la local.
  const status = statusSupabaseLocal()
  validarEntornoE2e({ url: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY })

  // 2. Usuarios, horario y enlace público (idempotente; el script repite la validación).
  execFileSync('node', ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/sembrar-usuarios-local.mjs'], { stdio: 'inherit' })
  await sembrarOdontologia(status)

  // 3. Una sesión guardada por rol.
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3100'
  const browser = await chromium.launch()
  for (const rol of Object.keys(USUARIOS_E2E) as RolE2e[]) {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    await page.getByPlaceholder('ejemplo@doctor.com').fill(USUARIOS_E2E[rol])
    await page.locator('input[type=password]').fill(PASSWORD_E2E)
    await page.getByRole('button', { name: 'Entrar al Sistema' }).click()
    await page.waitForURL('**/dashboard**')
    await page.context().storageState({ path: archivoSesion(rol) })
    await page.close()
  }
  await browser.close()
}

/**
 * Crea (o restablece) los 3 usuarios de prueba en la Supabase LOCAL y los enlaza a la clínica
 * de `supabase/seed.sql`. Se niega a correr si la URL no es la local.
 *
 * Uso:  npm run db:reset && npm run db:sembrar
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { esUrlLocal } from '../utils/entornoLocal.ts'

const CLINICA_ID = '00000000-0000-4000-a000-000000000001'
const SEDE_ID = '00000000-0000-4000-a000-000000000011'
const PASSWORD = 'E2e-Prueba-2026!'
const TOKEN_AGENDAR = 'e2e-agendar'

const USUARIOS = [
  { email: 'medico@e2e.test', first: 'Médico', last: 'Prueba', role: 'DOCTOR', isOrgAdmin: false, specialty: 'Medicina General' },
  { email: 'asistente@e2e.test', first: 'Asistente', last: 'Prueba', role: 'ASSISTANT', isOrgAdmin: false, specialty: null },
  { email: 'admin@e2e.test', first: 'Admin', last: 'Prueba', role: 'ADMIN', isOrgAdmin: true, specialty: 'Medicina General' },
]

/** Lee `supabase status -o env` (líneas `CLAVE="valor"`). */
function statusLocal() {
  let texto = ''
  try {
    texto = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // Supabase detenido: la URL queda vacía y esUrlLocal lo rechaza abajo.
  }
  const status = {}
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m) status[m[1]] = m[2]
  }
  return status
}

const { API_URL: url, SERVICE_ROLE_KEY: serviceKey } = statusLocal()
if (!esUrlLocal(url) || !serviceKey) {
  console.error('Supabase local no está corriendo: npm run db:local')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

async function buscarPorEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  return data.users.find((u) => u.email === email) ?? null
}

/** Horario de 07:00 a 20:00 todos los días y enlace fijo /agendar/e2e-agendar (portal público). */
async function sembrarAgendaPublica(doctorId) {
  const { error: delErr } = await admin.from('doctor_schedules').delete().eq('doctor_id', doctorId)
  if (delErr) throw new Error(`horario: ${delErr.message}`)
  const horario = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    clinic_id: CLINICA_ID, doctor_id: doctorId, location_id: SEDE_ID, weekday, start_time: '07:00', end_time: '20:00',
  }))
  const { error: horErr } = await admin.from('doctor_schedules').insert(horario)
  if (horErr) throw new Error(`horario: ${horErr.message}`)
  const { error: linkErr } = await admin.from('public_booking_links').upsert({
    clinic_id: CLINICA_ID, doctor_id: doctorId, location_id: SEDE_ID, token: TOKEN_AGENDAR, is_active: true,
  }, { onConflict: 'token' })
  if (linkErr) throw new Error(`enlace público: ${linkErr.message}`)
  console.log(`  ✓ horario 07:00–20:00 y enlace /agendar/${TOKEN_AGENDAR}`)
}

async function main() {
  for (const u of USUARIOS) {
    let id
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: u.first, last_name: u.last, role: u.role },
    })
    if (error) {
      const existente = await buscarPorEmail(u.email)
      if (!existente) throw new Error(`${u.email}: ${error.message}`)
      id = existente.id
      const { error: updErr } = await admin.auth.admin.updateUserById(id, { password: PASSWORD, email_confirm: true })
      if (updErr) throw new Error(`${u.email}: ${updErr.message}`)
    } else {
      id = data.user.id
    }

    const { error: perfilErr } = await admin.from('user_profiles').upsert({
      id,
      clinic_id: CLINICA_ID,
      first_name: u.first,
      last_name: u.last,
      role: u.role,
      is_org_admin: u.isOrgAdmin,
      specialty: u.specialty,
      default_location_id: SEDE_ID,
    }, { onConflict: 'id' })
    if (perfilErr) throw new Error(`perfil ${u.email}: ${perfilErr.message}`)

    if (u.isOrgAdmin) {
      const { error: ownerErr } = await admin.from('clinics').update({ owner_user_id: id }).eq('id', CLINICA_ID)
      if (ownerErr) throw new Error(`dueño de la clínica: ${ownerErr.message}`)
    }
    console.log(`✓ ${u.email} (${u.role})`)

    if (u.role === 'DOCTOR') await sembrarAgendaPublica(id)
  }
  console.log(`\nListo. Contraseña de los 3: ${PASSWORD}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })

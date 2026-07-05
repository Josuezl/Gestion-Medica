/**
 * Verificación de aislamiento multi-tenant (RLS) a nivel de API.
 *
 * Salda la "Fase 2" de la auditoría (auditoria_tecnica.md, A5) y el hallazgo P2-3 de
 * revision_tecnica_2026-07-05.md: prueba automatizada de que un tenant NO puede leer datos
 * de otro. Inicia sesión con el ANON KEY como un usuario real de cada tenant (igual que el
 * navegador) e intenta leer recursos del otro tenant directamente contra PostgREST; RLS debe
 * devolver 0 filas. Es de SOLO LECTURA: seguro de correr contra cualquier entorno.
 *
 * Uso (credenciales por entorno, nunca hardcodeadas en el repo):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=...            # de .env.local
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...       # de .env.local
 *   RLS_T1_EMAIL=usuario@tenantA  RLS_T1_PASS=...   # personal del tenant A
 *   RLS_T2_EMAIL=usuario@tenantB  RLS_T2_PASS=...   # personal del tenant B
 *   node --env-file=.env.local scripts/rls-isolation-check.mjs
 *
 * Descubre solo los datos que necesita (un paciente/consulta de cada tenant) a partir de la
 * sesión de cada usuario, así que no depende de IDs fijos. Sale con código 1 si detecta fuga.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const T1 = { email: process.env.RLS_T1_EMAIL, pass: process.env.RLS_T1_PASS }
const T2 = { email: process.env.RLS_T2_EMAIL, pass: process.env.RLS_T2_PASS }

if (!URL || !ANON || !T1.email || !T1.pass || !T2.email || !T2.pass) {
  console.error('Faltan variables de entorno. Requeridas: NEXT_PUBLIC_SUPABASE_URL, '
    + 'NEXT_PUBLIC_SUPABASE_ANON_KEY, RLS_T1_EMAIL, RLS_T1_PASS, RLS_T2_EMAIL, RLS_T2_PASS.')
  process.exit(2)
}

const results = []
const pass = (n) => { results.push(true); console.log('✅', n) }
const fail = (n, d) => { results.push(false); console.log('❌', n, '—', d) }

/** Inicia sesión con el anon key y devuelve el cliente + clinic_id del usuario. */
async function sessionFor(cred, label) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error } = await c.auth.signInWithPassword({ email: cred.email, password: cred.pass })
  if (error) throw new Error(`login ${label}: ${error.message}`)
  const { data: profile } = await c.from('user_profiles').select('clinic_id').eq('id', auth.user.id).single()
  if (!profile?.clinic_id) throw new Error(`${label}: usuario sin clinic_id`)
  return { client: c, clinicId: profile.clinic_id, label }
}

/** Un id propio de cada tabla, obtenido con la sesión del propio tenant (respetando RLS). */
async function ownIds(sess) {
  const pick = async (table) => (await sess.client.from(table).select('id').limit(1).maybeSingle()).data?.id
  return {
    patients: await pick('patients'),
    consultations: await pick('consultations'),
    prescriptions: await pick('prescriptions'),
    lab_orders: await pick('lab_orders'),
    study_requests: await pick('study_requests'),
    appointments: await pick('appointments'),
  }
}

/** El tenant `viewer` NO debe poder leer la fila `id` (propiedad del otro tenant). */
async function expectNoRead(viewer, table, id, otherLabel) {
  if (!id) { console.log('⏭  ', `${viewer.label} vs ${table} de ${otherLabel}: sin dato de referencia, omitido`); return }
  const name = `${viewer.label} no lee ${table} de ${otherLabel}`
  const { data, error } = await viewer.client.from(table).select('id').eq('id', id)
  if (error) return pass(`${name} (bloqueado: ${error.code || error.message})`)
  if (!data || data.length === 0) return pass(name)
  fail(name, `¡devolvió ${data.length} fila(s) ajenas!`)
}

/** Un conteo global de la tabla debe traer 0 filas del otro tenant. */
async function expectScoped(viewer, table, foreignClinic, otherLabel) {
  const name = `${viewer.label} solo ve ${table} de su clínica`
  const { data, error } = await viewer.client.from(table).select('clinic_id').limit(2000)
  if (error) return fail(name, 'error inesperado: ' + error.message)
  const foreign = (data || []).filter(r => r.clinic_id === foreignClinic).length
  if (foreign === 0) return pass(`${name} (0 filas de ${otherLabel})`)
  fail(name, `¡ve ${foreign} filas de ${otherLabel}!`)
}

try {
  const s1 = await sessionFor(T1, 'T1')
  const s2 = await sessionFor(T2, 'T2')
  if (s1.clinicId === s2.clinicId) throw new Error('Ambos usuarios pertenecen a la misma clínica: elige tenants distintos.')
  pass(`Login por API de ambos tenants (T1=${s1.label} ≠ T2=${s2.label})`)

  const id1 = await ownIds(s1)
  const id2 = await ownIds(s2)

  const TABLES = ['patients', 'consultations', 'prescriptions', 'lab_orders', 'study_requests', 'appointments']
  console.log('\n--- T1 intenta leer recursos de T2 ---')
  for (const t of TABLES) await expectNoRead(s1, t, id2[t], 'T2')
  console.log('\n--- T2 intenta leer recursos de T1 ---')
  for (const t of TABLES) await expectNoRead(s2, t, id1[t], 'T1')

  console.log('\n--- Conteos globales acotados al propio tenant ---')
  for (const t of ['patients', 'consultations', 'appointments']) {
    await expectScoped(s1, t, s2.clinicId, 'T2')
    await expectScoped(s2, t, s1.clinicId, 'T1')
  }
} catch (e) {
  fail('Suite RLS', e.message)
}

const ok = results.filter(Boolean).length
console.log(`\n=== ${ok}/${results.length} verificaciones en verde ===`)
process.exit(results.every(Boolean) ? 0 : 1)

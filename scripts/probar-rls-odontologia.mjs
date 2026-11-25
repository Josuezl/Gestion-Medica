import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { statusSupabaseLocal } from '../e2e/entorno.ts'
import { esUrlLocal } from '../utils/entornoLocal.ts'

function comprobar(respuesta, operacion) {
  if (respuesta.error) {
    throw new Error(`${operacion} (${respuesta.error.code}): ${respuesta.error.message}`)
  }
  return respuesta.data
}

async function main() {
  const { API_URL: url, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = statusSupabaseLocal()
  assert(esUrlLocal(url), 'La prueba requiere una URL de Supabase local')
  assert(anonKey && serviceKey, 'Faltan las claves de la Supabase local')

  const opciones = { auth: { autoRefreshToken: false, persistSession: false } }
  const admin = createClient(url, serviceKey, opciones)
  const clinica = randomUUID()
  const otraClinica = randomUUID()
  const paciente = randomUUID()
  const cita = randomUUID()
  const usuarios = []

  async function crearUsuario(nombre, clinicId, { esDentista = false, esOrgAdmin = false } = {}) {
    const email = `${nombre}-${randomUUID()}@e2e.test`
    const password = randomUUID()
    const { user } = comprobar(await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    }), `Crear usuario ${nombre}`)
    usuarios.push(user.id)
    comprobar(await admin.from('user_profiles').upsert({
      id: user.id,
      clinic_id: clinicId,
      first_name: nombre,
      last_name: 'Prueba RLS',
      role: 'DOCTOR',
      is_dentist: esDentista,
      is_org_admin: esOrgAdmin,
    }), `Configurar perfil ${nombre}`)

    const cliente = createClient(url, anonKey, opciones)
    comprobar(await cliente.auth.signInWithPassword({ email, password }), `Iniciar sesión ${nombre}`)
    return { cliente, id: user.id }
  }

  try {
    comprobar(await admin.from('clinics').insert([
      { id: clinica, name: 'Prueba RLS odontología', max_doctors_override: 3 },
      { id: otraClinica, name: 'Prueba RLS otra clínica' },
    ]), 'Crear las clínicas de prueba')
    const dentista = await crearUsuario('odontologo', clinica, { esDentista: true })
    const medico = await crearUsuario('medico', clinica)
    const orgAdmin = await crearUsuario('org-admin', clinica, { esOrgAdmin: true })
    const externo = await crearUsuario('externo', otraClinica)

    comprobar(await admin.from('patients').insert({
      id: paciente, clinic_id: clinica, first_name: 'Paciente', last_name: 'RLS', birth_date: '1990-01-01',
    }), 'Crear paciente de prueba')
    comprobar(await admin.from('appointments').insert({
      id: cita, clinic_id: clinica, patient_id: paciente, doctor_id: dentista.id,
      scheduled_at: new Date().toISOString(), status: 'CONFIRMED',
    }), 'Crear cita de prueba')

    const consulta = {
      clinic_id: clinica,
      patient_id: paciente,
      doctor_id: medico.id,
      reason_for_visit: 'Control',
      diagnosis: 'Control de prueba',
      treatment_plan: 'Seguimiento',
    }
    const estado = { version: 1, piezas: {}, regiones: {} }
    const parametros = {
      p_patient_id: paciente,
      p_appointment_id: cita,
      p_reason: 'Control dental',
      p_intraoral_exam: 'Examen de prueba',
      p_diagnosis: 'Diagnóstico de prueba',
      p_procedures_done: null,
      p_treatment_plan: 'Seguimiento dental',
      p_denticion: 'PERMANENTE',
      p_estado: estado,
    }

    const rpcSinLicencia = await dentista.cliente.rpc('guardar_consulta_dental', parametros)
    assert.equal(rpcSinLicencia.error?.code, '42501', 'RLS debe rechazar el RPC del odontólogo sin licencia')

    const activacionOrgAdmin = await orgAdmin.cliente.from('clinics')
      .update({ odontologia_habilitada: true }).eq('id', clinica)
    assert.equal(activacionOrgAdmin.error?.code, 'P0001', 'El trigger debe impedir que el org-admin active la licencia')
    const licencia = comprobar(await dentista.cliente.rpc('odontologia_habilitada_now'), 'Verificar licencia apagada por defecto')
    assert.equal(licencia, false)

    comprobar(await admin.from('clinics').update({ odontologia_habilitada: true }).eq('id', clinica),
      'Activar la licencia con service role')

    const rpcMedico = await medico.cliente.rpc('guardar_consulta_dental', parametros)
    assert.equal(rpcMedico.error?.code, '42501', 'RLS debe rechazar el RPC para el médico')
    const insertDental = await medico.cliente.from('consultations').insert({ ...consulta, tipo: 'DENTAL' })
    assert.equal(insertDental.error?.code, '42501', 'RLS debe rechazar el insert DENTAL del médico')
    const medica = comprobar(await medico.cliente.from('consultations').insert(consulta)
      .select('id, tipo').single(), 'Guardar consulta médica sin enviar tipo')
    assert.equal(medica.tipo, 'MEDICA')
    const cambioTipo = await medico.cliente.from('consultations').update({ tipo: 'DENTAL' }).eq('id', medica.id)
    assert.equal(cambioTipo.error?.code, '42501', 'RLS debe rechazar que el médico cambie el tipo a DENTAL')
    const insertOdontograma = await medico.cliente.from('odontogramas').insert({
      clinic_id: clinica, patient_id: paciente, consultation_id: medica.id,
      doctor_id: medico.id, denticion: 'PERMANENTE', estado,
    })
    assert.equal(insertOdontograma.error?.code, '42501', 'RLS debe rechazar el odontograma del médico')

    const rpcInvalido = await dentista.cliente.rpc('guardar_consulta_dental', {
      ...parametros, p_denticion: 'INVALIDA',
    })
    assert.equal(rpcInvalido.error?.code, '23514', 'El RPC debe rechazar una dentición inválida')
    const consultasTrasFallo = comprobar(await dentista.cliente.from('consultations')
      .select('id').eq('patient_id', paciente).eq('tipo', 'DENTAL'), 'Comprobar reversión de consulta')
    assert.deepEqual(consultasTrasFallo, [])

    const consultaDental = comprobar(await dentista.cliente.rpc('guardar_consulta_dental', parametros),
      'Guardar consulta dental como odontólogo')
    assert.match(consultaDental, /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i)
    const odontogramas = comprobar(await dentista.cliente.from('odontogramas').select('estado')
      .eq('consultation_id', consultaDental), 'Leer odontograma como odontólogo')
    assert.deepEqual(odontogramas, [{ estado }])
    const citaCompletada = comprobar(await dentista.cliente.from('appointments').select('status')
      .eq('id', cita).single(), 'Leer estado de la cita')
    assert.equal(citaCompletada.status, 'COMPLETED')

    const dentalLeida = comprobar(await medico.cliente.from('consultations').select('tipo, appointment_id')
      .eq('id', consultaDental).single(), 'Leer consulta dental como médico')
    assert.deepEqual(dentalLeida, { tipo: 'DENTAL', appointment_id: cita })
    const edicionDental = comprobar(await medico.cliente.from('consultations').update({ tipo: 'MEDICA' })
      .eq('id', consultaDental).select('id'), 'Intentar reclasificar consulta dental como médico')
    assert.deepEqual(edicionDental, [])
    const odontogramasMedico = comprobar(await medico.cliente.from('odontogramas').select('estado')
      .eq('consultation_id', consultaDental), 'Leer odontograma como médico')
    assert.deepEqual(odontogramasMedico, [{ estado }])

    const consultasExternas = comprobar(await externo.cliente.from('consultations').select('id')
      .eq('id', consultaDental), 'Leer consulta desde otra clínica')
    assert.deepEqual(consultasExternas, [])
    const odontogramasExternos = comprobar(await externo.cliente.from('odontogramas').select('id')
      .eq('consultation_id', consultaDental), 'Leer odontograma desde otra clínica')
    assert.deepEqual(odontogramasExternos, [])

    const ascenso = await medico.cliente.from('user_profiles').update({ is_dentist: true }).eq('id', medico.id)
    assert.equal(ascenso.error?.code, 'P0001', 'El trigger debe impedir que el médico se marque como odontólogo')
  } finally {
    comprobar(await admin.from('consultations').delete().eq('patient_id', paciente), 'Limpiar consultas de prueba')
    comprobar(await admin.from('patients').delete().eq('id', paciente), 'Limpiar paciente de prueba')
    for (const id of usuarios) comprobar(await admin.auth.admin.deleteUser(id), 'Limpiar usuario de prueba')
    comprobar(await admin.from('clinics').delete().in('id', [clinica, otraClinica]), 'Limpiar clínicas de prueba')
  }
}

try {
  await main()
  console.log('OK: licencia de odontología, permisos RLS, consulta médica sin tipo y guardado dental atómico')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

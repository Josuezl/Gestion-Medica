// Lógica de servidor (sin 'use server'): la llaman la Server Action y la ruta /api/guardar/*.
// Movida sin cambios desde app/dashboard/patients/actions.ts (Task 3B): una ruta de API
// mantiene su dirección entre despliegues; una pestaña abierta desde antes puede seguir guardando.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { isPediatric } from '@/utils/age'
import { canDoClinical } from '@/utils/permissions'
import { safeErrorMessage } from '@/utils/errors'
import { sanitizePhone } from '@/utils/phone'
import { findDuplicatePatient } from '@/utils/patientDuplicates'
import { revalidatePath } from 'next/cache'
import { antecedentesDesdeFormulario } from '@/utils/antecedentes'

// El N° de expediente debe ser único dentro de la clínica. Devuelve el paciente que YA lo usa
// (distinto de excludeId, para permitir editar el mismo paciente), o null. Comparación
// case-insensitive (ilike sin comodines = match exacto sin distinguir mayúsculas).
async function findPatientByRecordNumber(
  supabase: SupabaseClient,
  clinicId: string,
  recordNumber: string,
  excludeId?: string,
) {
  let q = supabase
    .from('patients')
    .select('id, first_name, last_name')
    .eq('clinic_id', clinicId)
    .ilike('record_number', recordNumber)
  if (excludeId) q = q.neq('id', excludeId)
  const { data } = await q.limit(1).maybeSingle()
  return data || null
}

export async function crearPaciente(formData: FormData, force = false) {
  const supabase = await createClient()

  // 1. Obtener la clínica del doctor logueado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) {
    return { error: 'El usuario no está asociado a ninguna clínica.' }
  }

  const firstName = formData.get('first_name') as string
  const lastName = formData.get('last_name') as string
  const birthDate = formData.get('birth_date') as string
  const idCard = (formData.get('id_card') as string || '').trim() || null
  const recordNumber = (formData.get('record_number') as string || '').trim() || null
  const gender = (formData.get('gender') as string || '').trim()

  // Género obligatorio al registrar (varios cálculos clínicos lo requieren, p. ej. crecimiento pediátrico).
  if (gender !== 'M' && gender !== 'F') {
    return { error: 'Selecciona el género del paciente.' }
  }

  // 1.b N° de expediente único en la clínica (bloqueo): si ya lo usa otro paciente, avisar con su nombre.
  if (recordNumber) {
    const taken = await findPatientByRecordNumber(supabase, profile.clinic_id, recordNumber)
    if (taken) {
      return { error: `El N° de expediente "${recordNumber}" ya pertenece a ${taken.first_name} ${taken.last_name}.`.replace(/\s+/g, ' ').trim() }
    }
  }

  // 1.c Validación anti-duplicados dentro de la clínica:
  //   - Bloqueo (no se puede saltar, ni con force): mismo nombre + fecha de nacimiento + género.
  //     Es un duplicado casi seguro (p. ej. dos asistentes registran al mismo recién nacido).
  //   - Aviso (se puede confirmar con force): mismo DNI, o mismo nombre+fecha con género distinto.
  const dup = await findDuplicatePatient(supabase, profile.clinic_id, firstName, lastName, birthDate, gender, idCard)
  // El bloqueo se enforce SIEMPRE en el servidor (aunque llegue force=true desde un cliente
  // manipulado): un duplicado exacto nombre+fecha+género no se puede registrar.
  if (dup?.block) {
    return { duplicate: { id: dup.id, name: dup.name, birthDate: dup.birthDate, block: true } }
  }
  if (dup && !force) {
    return { duplicate: { id: dup.id, name: dup.name, birthDate: dup.birthDate, block: false } }
  }

  const rawPhone = (formData.get('phone') as string || '').trim()
  const sanitizedPhone = rawPhone ? sanitizePhone(rawPhone) : null

  const patientData = {
    clinic_id: profile.clinic_id,
    created_by: user.id,
    first_name: firstName,
    last_name: lastName,
    id_card: idCard,
    record_number: recordNumber,
    gender,
    birth_date: birthDate,
    phone: sanitizedPhone,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
    blood_type: formData.get('blood_type') as string || null,
    // Los antecedentes ya no se piden al registrar (por privacidad, solo el médico los escribe en la
    // consulta). Sin default "Ninguna conocida": quedan vacíos hasta que el médico los registre.
    allergies: formData.get('allergies') as string || null,
    family_history: formData.get('family_history') as string || null,
    pathological_history: formData.get('pathological_history') as string || null,
    non_pathological_history: formData.get('non_pathological_history') as string || null,
    is_pediatric: isPediatric(birthDate),
    father_name: formData.get('father_name') as string || null,
    mother_name: formData.get('mother_name') as string || null,
  }

  const { data, error } = await supabase
    .from('patients')
    .insert([patientData])
    .select()
    .single()

  if (error) {
    return { error: safeErrorMessage('No se pudo registrar el paciente. Inténtalo de nuevo.', 'createPatient', error) }
  }

  revalidatePath('/dashboard/patients')
  // La acción hace el redirect(); la ruta de API devuelve la dirección y navega el cliente.
  return { redirectTo: `/dashboard/patients/${data.id}?creado=1` }
}

export async function actualizarPaciente(id: string, formData: FormData) {
  const supabase = await createClient()

  // Defensa en profundidad (A4): además de RLS, exigir sesión y acotar el UPDATE a la clínica
  // del usuario. Así, aunque una política RLS fallara, no se puede editar pacientes de otra clínica.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  const rawPhone = (formData.get('phone') as string || '').trim()
  const sanitizedPhone = rawPhone ? sanitizePhone(rawPhone) : null
  const recordNumber = (formData.get('record_number') as string || '').trim() || null

  // N° de expediente único en la clínica (bloqueo), excluyendo a este mismo paciente.
  if (recordNumber) {
    const taken = await findPatientByRecordNumber(supabase, authProfile.clinic_id, recordNumber, id)
    if (taken) {
      return { error: `El N° de expediente "${recordNumber}" ya pertenece a ${taken.first_name} ${taken.last_name}.`.replace(/\s+/g, ' ').trim() }
    }
  }

  // Datos personales: editables por cualquier miembro de la clínica (incluida asistente/enfermera).
  const patientData: Record<string, string | boolean | null> = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    id_card: formData.get('id_card') as string || null,
    record_number: recordNumber,
    gender: formData.get('gender') as string || null,
    birth_date: formData.get('birth_date') as string,
    phone: sanitizedPhone,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
    is_pediatric: isPediatric(formData.get('birth_date') as string),
    father_name: formData.get('father_name') as string || null,
    mother_name: formData.get('mother_name') as string || null,
  }

  // Datos clínicos (tipo de sangre, alergias, antecedentes): solo personal clínico (médico/admin).
  // Defensa en profundidad (A4): aunque el formulario de asistente/enfermera no los envía, el
  // servidor NO los modifica para ese rol (no confía en el cliente).
  if (canDoClinical(authProfile.role)) {
    patientData.blood_type = formData.get('blood_type') as string || null
    // Antecedentes con estado (Sin registrar / Niega / Refiere): ya no se rellena «Ninguna conocida».
    const antecedentes = antecedentesDesdeFormulario(formData)
    if (antecedentes.error) return { error: antecedentes.error }
    Object.assign(patientData, antecedentes.cambios)
  }

  const { data: updated, error } = await supabase
    .from('patients')
    .update(patientData)
    .eq('id', id)
    .eq('clinic_id', authProfile.clinic_id)
    .select('id')

  if (error) {
    return { error: safeErrorMessage('No se pudo actualizar el paciente. Inténtalo de nuevo.', 'updatePatient', error) }
  }
  if (!updated || updated.length === 0) {
    return { error: 'No tienes permiso para editar este paciente.' }
  }

  revalidatePath(`/dashboard/patients/${id}`)
  return { success: true }
}

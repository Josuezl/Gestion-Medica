'use server'

import { createClient } from '@/utils/supabase/server'
import { effectiveLimit } from '@/utils/clinicLimits'
import { isPediatric } from '@/utils/age'
import { canDoClinical } from '@/utils/permissions'
import { normalizeName } from '@/utils/validation'
import { safeErrorMessage } from '@/utils/errors'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Utilidad para limpiar el teléfono al formato de Honduras (+504)
// Normaliza el teléfono SIN guiones/espacios. Acepta números internacionales:
// con '+' se respeta el código de país; un número local de 8 dígitos asume Honduras (+504).
function sanitizePhone(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '') // solo dígitos
  if (!digits) return null
  if (hasPlus) return `+${digits}`               // internacional: respeta su código de país
  if (digits.length === 8) return `+504${digits}` // Honduras local (compat anterior)
  return digits                                   // otro formato: se guarda solo con dígitos
}

// Busca un posible paciente duplicado en la clínica: mismo DNI, o mismo nombre normalizado
// (sin acentos/mayúsculas) + misma fecha de nacimiento. Devuelve la fila o null.
async function findDuplicatePatient(
  supabase: any,
  clinicId: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  idCard: string | null,
) {
  // 1. Por DNI exacto (si se proporcionó).
  if (idCard) {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, birth_date')
      .eq('clinic_id', clinicId)
      .eq('id_card', idCard)
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  // 2. Por nombre normalizado + fecha de nacimiento (el DNI no siempre se captura).
  if (!birthDate) return null
  const { data: sameDob } = await supabase
    .from('patients')
    .select('id, first_name, last_name, birth_date')
    .eq('clinic_id', clinicId)
    .eq('birth_date', birthDate)
  const target = normalizeName(`${firstName} ${lastName}`)
  return (sameDob || []).find((p: any) => normalizeName(`${p.first_name} ${p.last_name}`) === target) || null
}

// El N° de expediente debe ser único dentro de la clínica. Devuelve el paciente que YA lo usa
// (distinto de excludeId, para permitir editar el mismo paciente), o null. Comparación
// case-insensitive (ilike sin comodines = match exacto sin distinguir mayúsculas).
async function findPatientByRecordNumber(
  supabase: any,
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

/**
 * Sugiere el siguiente N° de expediente para la clínica del usuario: toma el record_number con el
 * valor numérico más alto (entre los más recientes) y le suma 1, conservando prefijo/sufijo y el
 * relleno de ceros (ej. 6984SM -> 6985SM, EXP-00123 -> EXP-00124). null si aún no se usan.
 */
export async function suggestNextRecordNumber(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return null

  const { data } = await supabase
    .from('patients')
    .select('record_number')
    .eq('clinic_id', profile.clinic_id)
    .not('record_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (!data || data.length === 0) return null

  let best: RegExpMatchArray | null = null
  let bestNum = -1
  for (const row of data) {
    const m = String((row as any).record_number).match(/^(.*?)(\d+)(\D*)$/)
    if (!m) continue
    const n = parseInt(m[2], 10)
    if (n > bestNum) { bestNum = n; best = m }
  }
  if (!best) return null
  return `${best[1]}${String(bestNum + 1).padStart(best[2].length, '0')}${best[3]}`
}

/**
 * Config del N° de Expediente para el formulario de registro. El campo solo se muestra a las
 * clínicas con `clinics.show_record_number = true` (hoy solo Complejo Médico San Martín). Para el
 * resto queda oculto, salvo que en el futuro se active por tenant con ese flag.
 */
export async function getRecordNumberConfig(): Promise<{ enabled: boolean; suggested: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { enabled: false, suggested: null }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id, clinics(show_record_number)')
    .eq('id', user.id)
    .single()
  const enabled = !!(profile as any)?.clinics?.show_record_number
  if (!enabled) return { enabled: false, suggested: null }
  const suggested = await suggestNextRecordNumber()
  return { enabled: true, suggested }
}

export async function createPatient(formData: FormData, force = false) {
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

  // 1.b N° de expediente único en la clínica (bloqueo): si ya lo usa otro paciente, avisar con su nombre.
  if (recordNumber) {
    const taken = await findPatientByRecordNumber(supabase, profile.clinic_id, recordNumber)
    if (taken) {
      return { error: `El N° de expediente "${recordNumber}" ya pertenece a ${taken.first_name} ${taken.last_name}.`.replace(/\s+/g, ' ').trim() }
    }
  }

  // 1.c Validación anti-duplicados (aviso, no bloqueo): mismo DNI, o mismo nombre normalizado +
  //     fecha de nacimiento, dentro de la clínica. Se omite si el usuario confirma con force.
  if (!force) {
    const dup = await findDuplicatePatient(supabase, profile.clinic_id, firstName, lastName, birthDate, idCard)
    if (dup) {
      return { duplicate: { id: dup.id, name: `${dup.first_name} ${dup.last_name}`.trim(), birthDate: dup.birth_date } }
    }
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
    gender: formData.get('gender') as string || null,
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
  redirect(`/dashboard/patients/${data.id}?creado=1`)
}

export async function updatePatient(id: string, formData: FormData) {
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
  const patientData: Record<string, any> = {
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
    patientData.allergies = formData.get('allergies') as string || 'Ninguna conocida'
    patientData.family_history = formData.get('family_history') as string || null
    patientData.pathological_history = formData.get('pathological_history') as string || null
    patientData.non_pathological_history = formData.get('non_pathological_history') as string || null
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

export async function updatePatientGender(id: string, gender: string) {
  const supabase = await createClient()

  // Defensa en profundidad (A4): sesión + acotar a la clínica del usuario.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  const { data: updated, error } = await supabase
    .from('patients')
    .update({ gender })
    .eq('id', id)
    .eq('clinic_id', authProfile.clinic_id)
    .select('id')

  if (error) {
    return { error: safeErrorMessage('No se pudo actualizar el género. Inténtalo de nuevo.', 'updatePatientGender', error) }
  }
  if (!updated || updated.length === 0) {
    return { error: 'No tienes permiso para editar este paciente.' }
  }

  // Revalidar las dos rutas donde se ve el género frecuentemente
  revalidatePath(`/dashboard/patients/${id}`)
  revalidatePath(`/dashboard/consultations/new`)
  return { success: true }
}

const MAX_FILE_BYTES = 26214400 // 25 MB

/**
 * Pre-chequeo (antes de subir): valida tamaño y cuota del plan de la clínica.
 * Devuelve el clinic_id (derivado del servidor) para construir la ruta del archivo.
 * La subida real la hace el navegador directo a Supabase Storage (evita los límites
 * de body de Server Actions / Vercel y no satura el servidor).
 */
export async function checkStudyQuota(fileSize: number) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error de clínica' }

  if (fileSize > MAX_FILE_BYTES) {
    return { error: 'El archivo supera el límite de 25 MB. Comprime la imagen e intenta de nuevo.' }
  }

  const { data: clinicPlan } = await supabase
    .from('clinics')
    .select('max_storage_mb_override, plans(max_storage_mb)')
    .eq('id', profile.clinic_id)
    .single()
  const maxStorageMb = effectiveLimit((clinicPlan as any)?.max_storage_mb_override, (clinicPlan?.plans as any)?.max_storage_mb) ?? 1024
  const { data: usedBytes } = await supabase.rpc('clinic_storage_bytes')
  if ((usedBytes ?? 0) + fileSize > maxStorageMb * 1024 * 1024) {
    return { error: 'Límite de almacenamiento del plan alcanzado. Contacta para ampliar tu plan.' }
  }

  return { clinicId: profile.clinic_id as string }
}

/**
 * Registra los metadatos del estudio en la tabla `studies` DESPUÉS de que el navegador
 * subió el archivo directo a Storage. Verifica que la ruta pertenezca a la clínica del
 * usuario y reconfirma la cuota (autoritativo); si algo falla, borra el archivo subido.
 */
export async function recordMedicalStudy(patientId: string, name: string, filePath: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error de clínica' }

  // Defensa: la ruta debe estar dentro de la carpeta de su clínica (RLS ya lo enforce al subir).
  if (!filePath.startsWith(`${profile.clinic_id}/`)) {
    await supabase.storage.from('medical-studies').remove([filePath])
    return { error: 'Ruta de archivo inválida.' }
  }

  // Cuota autoritativa: el archivo ya está subido y contado; si excede, lo borramos.
  const { data: clinicPlan } = await supabase
    .from('clinics')
    .select('max_storage_mb_override, plans(max_storage_mb)')
    .eq('id', profile.clinic_id)
    .single()
  const maxStorageMb = effectiveLimit((clinicPlan as any)?.max_storage_mb_override, (clinicPlan?.plans as any)?.max_storage_mb) ?? 1024
  const { data: usedBytes } = await supabase.rpc('clinic_storage_bytes')
  if ((usedBytes ?? 0) > maxStorageMb * 1024 * 1024) {
    await supabase.storage.from('medical-studies').remove([filePath])
    return { error: 'Límite de almacenamiento del plan alcanzado. Contacta para ampliar tu plan.' }
  }

  const { error: dbError } = await supabase
    .from('studies')
    .insert([{
      clinic_id: profile.clinic_id,
      patient_id: patientId,
      name,
      file_url: filePath,
      uploaded_by: user.id
    }])

  if (dbError) {
    await supabase.storage.from('medical-studies').remove([filePath])
    return { error: safeErrorMessage('No se pudo registrar el estudio. Inténtalo de nuevo.', 'recordMedicalStudy', dbError) }
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  return { success: true }
}

/**
 * Elimina un estudio (fila + archivo). RLS solo permite al médico que lo subió o al
 * org-admin; los asistentes quedan bloqueados. Si el borrado de la fila no afecta nada
 * (no autorizado), no se toca el archivo.
 */
export async function deleteMedicalStudy(studyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Error de clínica' }

  // Borrar la fila (RLS gobierna el permiso). .select() devuelve lo realmente borrado.
  const { data: deleted, error: delError } = await supabase
    .from('studies')
    .delete()
    .eq('id', studyId)
    .select('id, file_url, patient_id')

  if (delError) return { error: safeErrorMessage('No se pudo eliminar el estudio. Inténtalo de nuevo.', 'deleteMedicalStudy', delError) }
  if (!deleted || deleted.length === 0) {
    return { error: 'No tienes permiso para eliminar este estudio.' }
  }

  const study = deleted[0]

  // Borrar el archivo de Storage
  if (study.file_url) {
    await supabase.storage.from('medical-studies').remove([study.file_url])
  }

  // Auditoría (vía función SECURITY DEFINER)
  await supabase.rpc('log_audit_event', {
    p_action: 'DELETE_STUDY',
    p_record_id: studyId,
    p_table_name: 'studies'
  })

  revalidatePath(`/dashboard/patients/${study.patient_id}`)
  return { success: true }
}

/**
 * Devuelve una URL firmada (5 min) para ver/descargar un estudio, generada BAJO DEMANDA (al hacer
 * clic), no por cada fila al cargar el expediente (evita el N+1 a Storage; hallazgo M5). Valida
 * sesión + que el estudio sea de la clínica del usuario.
 */
export async function getStudySignedUrl(studyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { data: authProfile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!authProfile?.clinic_id) return { error: 'No autorizado' }

  const { data: study } = await supabase
    .from('studies')
    .select('file_url')
    .eq('id', studyId)
    .eq('clinic_id', authProfile.clinic_id)
    .single()
  if (!study?.file_url) return { error: 'Estudio no encontrado.' }

  const { data, error } = await supabase.storage
    .from('medical-studies')
    .createSignedUrl(study.file_url, 300) // 5 minutos
  if (error || !data?.signedUrl) {
    return { error: safeErrorMessage('No se pudo generar el enlace del estudio.', 'getStudySignedUrl', error) }
  }
  return { url: data.signedUrl }
}

/**
 * Búsqueda dinámica de pacientes para el selector de citas (agenda).
 * Igual que la búsqueda de la página de Pacientes: divide la query en palabras
 * y exige que cada palabra aparezca en alguno de los campos (AND entre palabras,
 * OR entre campos). Esto permite buscar "Juan Carlos Vaquedano" aunque el nombre
 * y el apellido estén en columnas separadas.
 * Devuelve máximo 30 resultados para el dropdown.
 */
export async function searchPatientsForAgenda(query: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return []

  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  let dbQuery = supabase
    .from('patients')
    .select('id, first_name, last_name, phone, birth_date, gender, id_card, record_number, dob_status')
    .eq('clinic_id', profile.clinic_id)

  // Por cada palabra, al menos uno de los campos debe contenerla
  words.forEach(word => {
    dbQuery = dbQuery.or(
      `first_name.ilike.%${word}%,last_name.ilike.%${word}%,phone.ilike.%${word}%,id_card.ilike.%${word}%,record_number.ilike.%${word}%`
    )
  })

  const { data } = await dbQuery
    .order('last_name', { ascending: true })
    .limit(30)

  return data || []
}

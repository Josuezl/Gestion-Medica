'use server'

import { createClient } from '@/utils/supabase/server'
import { effectiveLimit } from '@/utils/clinicLimits'
import { safeErrorMessage } from '@/utils/errors'
import { sanitizeSearchTerm } from '@/utils/validation'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { actualizarPaciente, crearPaciente } from '@/utils/guardado/paciente'

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
    const m = String(row.record_number ?? '').match(/^(.*?)(\d+)(\D*)$/)
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
  // El join clinics(...) es a-uno: llega como objeto, aunque la inferencia del cliente diga arreglo.
  const cfg = profile as unknown as { clinics: { show_record_number: boolean | null } | null } | null
  const enabled = !!cfg?.clinics?.show_record_number
  if (!enabled) return { enabled: false, suggested: null }
  const suggested = await suggestNextRecordNumber()
  return { enabled: true, suggested }
}

export async function createPatient(formData: FormData, force = false) {
  const result = await crearPaciente(formData, force)
  if (result.redirectTo) redirect(result.redirectTo)
  return result
}

export async function updatePatient(id: string, formData: FormData) {
  return actualizarPaciente(id, formData)
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
  const limits = clinicPlan as unknown as { max_storage_mb_override: number | null; plans: { max_storage_mb: number | null } | null } | null
  const maxStorageMb = effectiveLimit(limits?.max_storage_mb_override, limits?.plans?.max_storage_mb) ?? 1024
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
  const limits = clinicPlan as unknown as { max_storage_mb_override: number | null; plans: { max_storage_mb: number | null } | null } | null
  const maxStorageMb = effectiveLimit(limits?.max_storage_mb_override, limits?.plans?.max_storage_mb) ?? 1024
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

  // sanitizeSearchTerm: el texto se interpola en la sintaxis del filtro or() de PostgREST
  const words = sanitizeSearchTerm(query).split(/\s+/).filter(Boolean)
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

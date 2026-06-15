'use server'

import { createClient } from '@/utils/supabase/server'
import { effectiveLimit } from '@/utils/clinicLimits'
import { isPediatric } from '@/utils/age'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Utilidad para limpiar el teléfono al formato de Honduras (+504)
function sanitizePhone(phone: string) {
  const cleaned = phone.replace(/\D/g, '') // Eliminar no-dígitos
  if (cleaned.length === 8) {
    return `+504${cleaned}`
  }
  if (cleaned.startsWith('504') && cleaned.length === 11) {
    return `+${cleaned}`
  }
  return phone // Si ya tiene el formato o es inválido, devolver tal cual para que valide la DB
}

export async function createPatient(formData: FormData) {
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

  const rawPhone = formData.get('phone') as string
  const sanitizedPhone = sanitizePhone(rawPhone)

  const patientData = {
    clinic_id: profile.clinic_id,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    id_card: formData.get('id_card') as string || null,
    gender: formData.get('gender') as string || null,
    birth_date: formData.get('birth_date') as string,
    phone: sanitizedPhone,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
    blood_type: formData.get('blood_type') as string || null,
    allergies: formData.get('allergies') as string || 'Ninguna conocida',
    family_history: formData.get('family_history') as string || null,
    pathological_history: formData.get('pathological_history') as string || null,
    non_pathological_history: formData.get('non_pathological_history') as string || null,
    is_pediatric: isPediatric(formData.get('birth_date') as string),
    father_name: formData.get('father_name') as string || null,
    mother_name: formData.get('mother_name') as string || null,
  }

  const { data, error } = await supabase
    .from('patients')
    .insert([patientData])
    .select()
    .single()

  if (error) {
    return { error: `Error al registrar paciente: ${error.message}` }
  }

  revalidatePath('/dashboard/patients')
  redirect(`/dashboard/patients/${data.id}`)
}

export async function updatePatient(id: string, formData: FormData) {
  const supabase = await createClient()

  const rawPhone = formData.get('phone') as string
  const sanitizedPhone = sanitizePhone(rawPhone)

  const patientData = {
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    id_card: formData.get('id_card') as string || null,
    gender: formData.get('gender') as string || null,
    birth_date: formData.get('birth_date') as string,
    phone: sanitizedPhone,
    email: formData.get('email') as string || null,
    address: formData.get('address') as string || null,
    blood_type: formData.get('blood_type') as string || null,
    allergies: formData.get('allergies') as string || 'Ninguna conocida',
    family_history: formData.get('family_history') as string || null,
    pathological_history: formData.get('pathological_history') as string || null,
    non_pathological_history: formData.get('non_pathological_history') as string || null,
    is_pediatric: isPediatric(formData.get('birth_date') as string),
    father_name: formData.get('father_name') as string || null,
    mother_name: formData.get('mother_name') as string || null,
  }

  const { error } = await supabase
    .from('patients')
    .update(patientData)
    .eq('id', id)

  if (error) {
    return { error: `Error al actualizar paciente: ${error.message}` }
  }

  revalidatePath(`/dashboard/patients/${id}`)
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
    return { error: `Error al registrar estudio: ${dbError.message}` }
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

  if (delError) return { error: `Error al eliminar: ${delError.message}` }
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

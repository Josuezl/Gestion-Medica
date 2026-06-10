'use server'

import { createClient } from '@/utils/supabase/server'
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
    is_pediatric: formData.get('is_pediatric') === 'true',
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
    is_pediatric: formData.get('is_pediatric') === 'true',
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

export async function uploadMedicalStudy(patientId: string, name: string, file: File) {
  const supabase = await createClient()

  // 1. Obtener la clínica
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Error de clínica' }

  // 2. Validar tamaño del archivo (defensa en profundidad; el bucket también lo limita a 25 MB)
  const MAX_FILE_BYTES = 26214400 // 25 MB
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'El archivo supera el límite de 25 MB. Comprime la imagen e intenta de nuevo.' }
  }

  // 3. Validar cuota de almacenamiento del plan de la clínica
  const { data: clinicPlan } = await supabase
    .from('clinics')
    .select('plans(max_storage_mb)')
    .eq('id', profile.clinic_id)
    .single()
  const maxStorageMb = (clinicPlan?.plans as any)?.max_storage_mb ?? 1024
  const { data: usedBytes } = await supabase.rpc('clinic_storage_bytes')
  if ((usedBytes ?? 0) + file.size > maxStorageMb * 1024 * 1024) {
    return { error: 'Límite de almacenamiento del plan alcanzado. Contacta para ampliar tu plan.' }
  }

  // 4. Subir archivo a Supabase Storage
  // Nota: Creamos la carpeta por clínica y paciente
  const fileExt = file.name.split('.').pop()
  const filePath = `${profile.clinic_id}/${patientId}/${Date.now()}.${fileExt}`

  // Convertir File a ArrayBuffer para subir vía Deno/Next.js Server Actions
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const { error: uploadError } = await supabase.storage
    .from('medical-studies')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: true
    })

  if (uploadError) {
    return { error: `Error al subir archivo: ${uploadError.message}` }
  }

  // 3. Registrar en la base de datos
  const { error: dbError } = await supabase
    .from('studies')
    .insert([{
      clinic_id: profile.clinic_id,
      patient_id: patientId,
      name: name,
      file_url: filePath
    }])

  if (dbError) {
    // Limpiar archivo si la inserción falló
    await supabase.storage.from('medical-studies').remove([filePath])
    return { error: `Error al registrar estudio: ${dbError.message}` }
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  return { success: true }
}

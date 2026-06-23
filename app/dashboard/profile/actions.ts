'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { safeErrorMessage } from '@/utils/errors'

const LOGO_MAX_BYTES = 2097152 // 2 MB
const LOGO_MIME = ['image/png', 'image/jpeg']

/**
 * Actualiza el perfil del USUARIO ACTUAL (solo el suyo). Nunca toca role/clinic_id/is_org_admin.
 * Los campos clínicos (especialidad, colegiación, datos de receta) solo aplican a médicos.
 */
export async function updateOwnProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado.' }

  const { data: me } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  const clinical = me?.role === 'DOCTOR' || me?.role === 'ADMIN'

  const firstName = (formData.get('first_name') as string || '').trim()
  const lastName = (formData.get('last_name') as string || '').trim()
  if (!firstName || !lastName) return { error: 'Nombre y apellido son requeridos.' }
  const g = formData.get('gender') as string
  const gender = ['M', 'F', 'O'].includes(g) ? g : null

  const updates: Record<string, any> = {
    first_name: firstName,
    last_name: lastName,
    gender,
    phone: (formData.get('phone') as string || '').trim() || null,
  }
  if (clinical) {
    updates.specialty = (formData.get('specialty') as string || '').trim() || null
    updates.professional_id = (formData.get('professional_id') as string || '').trim() || null
    updates.practice_name = (formData.get('practice_name') as string || '').trim() || null
    updates.practice_phone = (formData.get('practice_phone') as string || '').trim() || null
    updates.practice_address = (formData.get('practice_address') as string || '').trim() || null
    updates.practice_logo_url = (formData.get('practice_logo_url') as string || '').trim() || null
  }

  // Defensa en profundidad: acotar el UPDATE a la propia fila (id = usuario autenticado).
  const { error } = await supabase.from('user_profiles').update(updates).eq('id', user.id)
  if (error) return { error: safeErrorMessage('No se pudo guardar tu información.', 'updateOwnProfile', error) }

  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Sube el logo/ícono del consultorio del MÉDICO actual al bucket público `signatures`. Si se define,
 * tiene prioridad sobre el logo de la organización en los documentos impresos de este médico.
 * Solo JPG o PNG. Devuelve la URL pública; se guarda en `practice_logo_url` al "Guardar cambios".
 */
export async function uploadOwnLogo(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado.' }

  const { data: me } = await supabase
    .from('user_profiles').select('role, clinic_id').eq('id', user.id).single()
  const clinical = me?.role === 'DOCTOR' || me?.role === 'ADMIN'
  if (!clinical || !me?.clinic_id) return { error: 'Solo el personal médico puede subir un logo.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió ninguna imagen.' }
  if (!LOGO_MIME.includes(file.type)) return { error: 'El logo debe ser una imagen JPG o PNG.' }
  if (file.size > LOGO_MAX_BYTES) return { error: 'La imagen supera el límite de 2 MB. Comprímela e intenta de nuevo.' }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const filePath = `${me.clinic_id}/${user.id}/practice-logo-${Date.now()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('signatures')
    .upload(filePath, bytes, { contentType: file.type, upsert: true })
  if (upErr) return { error: 'Error al subir el logo: ' + upErr.message }

  const { data: pub } = admin.storage.from('signatures').getPublicUrl(filePath)
  return { url: pub.publicUrl }
}

/**
 * Cambia la contraseña del usuario actual. Verifica la contraseña ACTUAL re-autenticando
 * (signInWithPassword) antes de actualizarla.
 */
export async function changeOwnPassword(formData: FormData) {
  const current = (formData.get('current_password') as string) || ''
  const next = (formData.get('new_password') as string) || ''
  const confirm = (formData.get('confirm_password') as string) || ''

  if (next.length < 8) return { error: 'La nueva contraseña debe tener al menos 8 caracteres.' }
  if (next !== confirm) return { error: 'La nueva contraseña y su confirmación no coinciden.' }
  if (!current) return { error: 'Ingresa tu contraseña actual.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'No autorizado.' }

  // Verificar la contraseña actual (re-autenticación). Mismo usuario → mantiene la sesión.
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current })
  if (signInErr) return { error: 'La contraseña actual es incorrecta.' }

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { error: safeErrorMessage('No se pudo cambiar la contraseña.', 'changeOwnPassword', error) }

  return { success: true }
}

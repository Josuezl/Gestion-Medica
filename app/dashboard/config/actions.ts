'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireOrgAdmin } from '@/utils/auth-guard'
import { provisionUserAccount } from '@/utils/provisioning'
import { effectiveLimit } from '@/utils/clinicLimits'
import { DEFAULT_LAB_CATALOG } from '@/utils/labCatalog'
import { DEFAULT_STUDY_CATALOG } from '@/utils/studyCatalog'
import { validateScheduleRanges } from '@/utils/booking'
import { safeErrorMessage } from '@/utils/errors'
import { revalidatePath } from 'next/cache'

const SIGNATURE_MAX_BYTES = 2097152 // 2 MB
const SIGNATURE_MIME = ['image/png', 'image/jpeg', 'image/webp']
// El logo de los documentos impresos: solo JPG o PNG (requisito del usuario).
const LOGO_MIME = ['image/png', 'image/jpeg']

/**
 * Provisión de un miembro de equipo (médico/asistente) por el org-admin de la clínica.
 * Crea la cuenta de inmediato (limitada por los topes del plan) y le envía un enlace de
 * un solo uso para que fije su propia contraseña. Misma ruta segura que /superadmin.
 */
export async function sendInvitation(formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado. Solo los administradores de la organización pueden invitar.' }

  const firstName = (formData.get('firstName') as string || '').trim()
  const lastName = (formData.get('lastName') as string || '').trim()
  const email = (formData.get('email') as string || '').trim().toLowerCase()
  const role = formData.get('role') as string
  const specialty = (formData.get('specialty') as string || '').trim()
  const gender = (formData.get('gender') as string || '').trim()

  if (!firstName || !lastName || !email || !role) {
    return { error: 'Nombre, apellido, correo y rol son requeridos.' }
  }
  if (role !== 'DOCTOR' && role !== 'ASSISTANT' && role !== 'NURSE') {
    return { error: 'Rol no válido.' }
  }

  const supabase = await createClient()

  // Verificar topes ANTES de crear la cuenta. Tope efectivo = override por-clínica o plan.
  const { data: planData } = await supabase
    .from('plans')
    .select('*')
    .eq('code', ctx.planCode)
    .single()

  const { data: clinicRow } = await supabase
    .from('clinics')
    .select('max_doctors_override, max_assistants_override')
    .eq('id', ctx.clinicId)
    .single()

  if (planData) {
    const isDoctorRole = role === 'DOCTOR'
    // El personal de apoyo (asistente + enfermería) comparte el cupo de "assistants".
    let countQuery = supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinicId)
    countQuery = isDoctorRole ? countQuery.eq('role', 'DOCTOR') : countQuery.in('role', ['ASSISTANT', 'NURSE'])
    const { count: currentUsers } = await countQuery

    const maxAllowed = isDoctorRole
      ? effectiveLimit(clinicRow?.max_doctors_override, planData.max_doctors)
      : effectiveLimit(clinicRow?.max_assistants_override, planData.max_assistants)

    if (maxAllowed !== null && currentUsers !== null && currentUsers >= maxAllowed) {
      const label = isDoctorRole ? 'médicos' : 'personal de apoyo (asistentes/enfermería)'
      return { error: `Has alcanzado el límite de ${maxAllowed} ${label} para este tenant.` }
    }
  }

  // Crear cuenta + enviar enlace de fijar contraseña.
  const inviterName = `${ctx.profile.first_name} ${ctx.profile.last_name}`
  const result = await provisionUserAccount({
    email,
    firstName,
    lastName,
    clinicId: ctx.clinicId,
    clinicName: ctx.clinicName,
    role,
    isOrgAdmin: false,
    specialty: specialty || null,
    gender: gender || null,
    inviterName,
  })

  if (result.error) {
    return { error: result.error }
  }

  revalidatePath('/dashboard/config')
  return {
    success: true,
    warning: result.emailError ? `Cuenta creada, pero el email falló: ${result.emailError}` : undefined,
  }
}

export interface TeamMemberUpdate {
  firstName: string
  lastName: string
  specialty: string
  professionalId: string
  gender: string // '', 'M', 'F', 'O'
  practiceName: string
  practicePhone: string
  practiceAddress: string
  signatureUrl?: string
  role?: string // 'DOCTOR' | 'ASSISTANT' | 'NURSE' (opcional: cambia el rol del miembro)
}

/**
 * Sube la imagen de firma/sello de un médico al bucket público `signatures`.
 *
 * Se hace en el servidor con el cliente SERVICE_ROLE (ignora RLS) pero solo después de
 * validar que quien llama es org-admin y que el miembro pertenece a su clínica; la ruta
 * queda acotada a `clinic_id/member_id/...`. Así la subida no depende de las políticas de
 * Storage del navegador. Devuelve la URL pública; el guardado en el perfil ocurre al
 * presionar "Guardar Cambios" (updateTeamMember).
 */
export async function uploadMemberSignature(memberId: string, formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado. Solo los administradores pueden subir la firma.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió ninguna imagen.' }
  if (!SIGNATURE_MIME.includes(file.type)) return { error: 'La firma debe ser una imagen PNG, JPG o WEBP.' }
  if (file.size > SIGNATURE_MAX_BYTES) return { error: 'La imagen supera el límite de 2 MB. Comprímela e intenta de nuevo.' }

  // El miembro debe pertenecer a la clínica del admin (aislamiento de tenant).
  const supabase = await createClient()
  const { data: member } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', memberId)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (!member) return { error: 'No tienes permiso para editar este miembro.' }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const filePath = `${ctx.clinicId}/${memberId}/${Date.now()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('signatures')
    .upload(filePath, bytes, { contentType: file.type, upsert: true })
  if (upErr) return { error: 'Error al subir la firma: ' + upErr.message }

  const { data: pub } = admin.storage.from('signatures').getPublicUrl(filePath)
  return { url: pub.publicUrl }
}

/**
 * Sube el logo/ícono de la ORGANIZACIÓN (clínica) al bucket público `signatures`. Aparece a la
 * izquierda del encabezado en todos los documentos impresos. Solo JPG o PNG. Igual que la firma,
 * devuelve la URL pública; el guardado en `clinics.logo_url` ocurre al presionar "Guardar Cambios".
 */
export async function uploadClinicLogo(formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado. Solo los administradores pueden subir el logo.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No se recibió ninguna imagen.' }
  if (!LOGO_MIME.includes(file.type)) return { error: 'El logo debe ser una imagen JPG o PNG.' }
  if (file.size > SIGNATURE_MAX_BYTES) return { error: 'La imagen supera el límite de 2 MB. Comprímela e intenta de nuevo.' }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const filePath = `${ctx.clinicId}/clinic-logo/${Date.now()}.${ext}`
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
 * Edición de los datos de un miembro existente por el org-admin, incluido CAMBIAR su rol
 * entre Médico, Asistente y Auxiliar de Enfermería (NURSE). El tope de médicos/asistentes lo
 * valida el trigger enforce_user_limits. Sirve también para fijar el género ("Dra." vs "Dr.").
 */
export async function updateTeamMember(memberId: string, data: TeamMemberUpdate) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado. Solo los administradores pueden editar miembros.' }

  const firstName = (data.firstName || '').trim()
  const lastName = (data.lastName || '').trim()
  if (!firstName || !lastName) return { error: 'Nombre y apellido son requeridos.' }

  const gender = ['M', 'F', 'O'].includes(data.gender) ? data.gender : null

  const updates: Record<string, any> = {
    first_name: firstName,
    last_name: lastName,
    specialty: (data.specialty || '').trim() || null,
    professional_id: (data.professionalId || '').trim() || null,
    gender,
    practice_name: (data.practiceName || '').trim() || null,
    practice_phone: (data.practicePhone || '').trim() || null,
    practice_address: (data.practiceAddress || '').trim() || null,
    signature_url: (data.signatureUrl || '').trim() || null,
  }
  // Cambio de rol opcional. Solo roles de personal (el ADMIN/org-admin no se gestiona aquí).
  if (data.role && ['DOCTOR', 'ASSISTANT', 'NURSE'].includes(data.role)) {
    updates.role = data.role
  }

  const supabase = await createClient()
  // Solo se actualiza si el miembro pertenece a la misma clínica del admin (aislamiento de tenant).
  const { data: updated, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', memberId)
    .eq('clinic_id', ctx.clinicId)
    .select('id')

  if (error) return { error: 'Error al actualizar: ' + error.message }
  if (!updated || updated.length === 0) return { error: 'No tienes permiso para editar este miembro.' }

  revalidatePath('/dashboard/config')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function revokeInvitation(invitationId: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clinic_invitations')
    .update({ status: 'REVOKED' })
    .eq('id', invitationId)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Error al revocar: ' + error.message }
  
  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateClinicInfo(formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const logoUrl = (formData.get('logo_url') as string || '').trim() || null

  if (!name) return { error: 'El nombre de la clínica es requerido' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clinics')
    .update({ name, phone, address, logo_url: logoUrl })
    .eq('id', ctx.clinicId)

  if (error) return { error: 'Error al actualizar información: ' + error.message }
  
  revalidatePath('/dashboard/config')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function createLocation(formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!name) return { error: 'El nombre de la clínica es requerido' }

  const supabase = await createClient()

  // Tope efectivo: el override por-clínica manda sobre el del plan (si existe).
  const { data: planData } = await supabase
    .from('plans')
    .select('max_locations')
    .eq('code', ctx.planCode)
    .single()

  const { data: clinicRow } = await supabase
    .from('clinics')
    .select('max_locations_override')
    .eq('id', ctx.clinicId)
    .single()

  const effectiveMax = clinicRow?.max_locations_override ?? planData?.max_locations ?? null

  if (effectiveMax !== null) {
    const { count: currentLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinicId)

    if (currentLocations !== null && currentLocations >= effectiveMax) {
      return { error: `Límite alcanzado (${effectiveMax} clínicas).` }
    }
  }

  const { error } = await supabase
    .from('locations')
    .insert([{
      clinic_id: ctx.clinicId,
      name,
      address: address || null
    }])

  if (error) return { error: 'Error al crear la clínica: ' + error.message }
  
  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function toggleLocationStatus(id: string, isActive: boolean) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('locations')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Error al actualizar estado: ' + error.message }
  
  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateLocation(id: string, name: string, address: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('locations')
    .update({ name, address })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Error al actualizar la clínica: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

// ============================================================================
// Catálogo de Laboratorio (mantenimiento por el administrador de la clínica)
// ============================================================================

/**
 * Siembra el catálogo estándar (DEFAULT_LAB_CATALOG) para la clínica del admin.
 * Idempotente: no hace nada si la clínica ya tiene categorías.
 */
export async function seedDefaultLabCatalog() {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('lab_test_categories')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinicId)
  if ((count ?? 0) > 0) return { success: true } // ya tiene catálogo

  for (let c = 0; c < DEFAULT_LAB_CATALOG.length; c++) {
    const cat = DEFAULT_LAB_CATALOG[c]
    const { data: catRow, error: catErr } = await supabase
      .from('lab_test_categories')
      .insert([{ clinic_id: ctx.clinicId, name: cat.category, sort_order: c }])
      .select('id')
      .single()
    if (catErr || !catRow) return { error: 'Error al cargar el catálogo: ' + (catErr?.message || '') }

    const rows = cat.tests.map((name, i) => ({
      clinic_id: ctx.clinicId,
      category_id: catRow.id,
      name,
      sort_order: i,
    }))
    const { error: testErr } = await supabase.from('lab_tests').insert(rows)
    if (testErr) return { error: 'Error al cargar exámenes: ' + testErr.message }
  }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function createLabCategory(name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre de la categoría es requerido.' }

  const supabase = await createClient()
  // sort_order al final
  const { data: last } = await supabase
    .from('lab_test_categories')
    .select('sort_order')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort = ((last?.sort_order ?? -1) as number) + 1

  const { error } = await supabase
    .from('lab_test_categories')
    .insert([{ clinic_id: ctx.clinicId, name: clean, sort_order: sort }])
  if (error) return { error: 'Error al crear la categoría: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateLabCategory(id: string, name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre de la categoría es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_test_categories')
    .update({ name: clean })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar la categoría: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function deleteLabCategory(id: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  // Los exámenes se borran en cascada (FK on delete cascade).
  const { error } = await supabase
    .from('lab_test_categories')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al eliminar la categoría: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function createLabTest(categoryId: string, name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre del examen es requerido.' }

  const supabase = await createClient()
  // La categoría debe ser de la misma clínica.
  const { data: cat } = await supabase
    .from('lab_test_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (!cat) return { error: 'Categoría no válida.' }

  const { data: last } = await supabase
    .from('lab_tests')
    .select('sort_order')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort = ((last?.sort_order ?? -1) as number) + 1

  const { error } = await supabase
    .from('lab_tests')
    .insert([{ clinic_id: ctx.clinicId, category_id: categoryId, name: clean, sort_order: sort }])
  if (error) return { error: 'Error al crear el examen: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateLabTest(id: string, name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre del examen es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_tests')
    .update({ name: clean })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar el examen: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function toggleLabTest(id: string, isActive: boolean) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_tests')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar el examen: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function deleteLabTest(id: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_tests')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al eliminar el examen: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

/** Activa o desactiva TODOS los exámenes de una categoría de una sola vez. */
export async function setLabCategoryTestsActive(categoryId: string, isActive: boolean) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_tests')
    .update({ is_active: isActive })
    .eq('category_id', categoryId)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar los exámenes: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

// ============================================================================
// Catálogo de Estudios (estudios de gabinete: cardiología, radiología, etc.)
// Mantenimiento por el administrador de la clínica. Cada estudio incluye descripción
// e indicaciones para el paciente (lo nuevo respecto al catálogo de laboratorio).
// ============================================================================

/**
 * Siembra el catálogo estándar de estudios (DEFAULT_STUDY_CATALOG) para la clínica del admin.
 * Idempotente: no hace nada si la clínica ya tiene secciones.
 */
export async function seedDefaultStudyCatalog() {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('study_sections')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinicId)
  if ((count ?? 0) > 0) return { success: true } // ya tiene catálogo

  for (let s = 0; s < DEFAULT_STUDY_CATALOG.length; s++) {
    const sec = DEFAULT_STUDY_CATALOG[s]
    const { data: secRow, error: secErr } = await supabase
      .from('study_sections')
      .insert([{ clinic_id: ctx.clinicId, name: sec.section, sort_order: s }])
      .select('id')
      .single()
    if (secErr || !secRow) return { error: 'Error al cargar el catálogo: ' + (secErr?.message || '') }

    const rows = sec.studies.map((st, i) => ({
      clinic_id: ctx.clinicId,
      section_id: secRow.id,
      name: st.name,
      description: st.description || null,
      patient_indication: st.indication || null,
      sort_order: i,
    }))
    const { error: itemErr } = await supabase.from('study_catalog').insert(rows)
    if (itemErr) return { error: 'Error al cargar estudios: ' + itemErr.message }
  }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function createStudySection(name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre de la sección es requerido.' }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('study_sections')
    .select('sort_order')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort = ((last?.sort_order ?? -1) as number) + 1

  const { error } = await supabase
    .from('study_sections')
    .insert([{ clinic_id: ctx.clinicId, name: clean, sort_order: sort }])
  if (error) return { error: 'Error al crear la sección: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateStudySection(id: string, name: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre de la sección es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('study_sections')
    .update({ name: clean })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar la sección: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function deleteStudySection(id: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  // Los estudios se borran en cascada (FK on delete cascade).
  const { error } = await supabase
    .from('study_sections')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al eliminar la sección: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function createStudyItem(sectionId: string, name: string, description: string, indication: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre del estudio es requerido.' }

  const supabase = await createClient()
  // La sección debe ser de la misma clínica.
  const { data: sec } = await supabase
    .from('study_sections')
    .select('id')
    .eq('id', sectionId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (!sec) return { error: 'Sección no válida.' }

  const { data: last } = await supabase
    .from('study_catalog')
    .select('sort_order')
    .eq('section_id', sectionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort = ((last?.sort_order ?? -1) as number) + 1

  const { error } = await supabase
    .from('study_catalog')
    .insert([{
      clinic_id: ctx.clinicId,
      section_id: sectionId,
      name: clean,
      description: (description || '').trim() || null,
      patient_indication: (indication || '').trim() || null,
      sort_order: sort,
    }])
  if (error) return { error: 'Error al crear el estudio: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function updateStudyItem(id: string, name: string, description: string, indication: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  const clean = (name || '').trim()
  if (!clean) return { error: 'El nombre del estudio es requerido.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('study_catalog')
    .update({
      name: clean,
      description: (description || '').trim() || null,
      patient_indication: (indication || '').trim() || null,
    })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar el estudio: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function toggleStudyItem(id: string, isActive: boolean) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('study_catalog')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar el estudio: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function deleteStudyItem(id: string) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('study_catalog')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al eliminar el estudio: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

/** Activa o desactiva TODOS los estudios de una sección de una sola vez. */
export async function setStudySectionItemsActive(sectionId: string, isActive: boolean) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('study_catalog')
    .update({ is_active: isActive })
    .eq('section_id', sectionId)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: 'Error al actualizar los estudios: ' + error.message }

  revalidatePath('/dashboard/config')
  return { success: true }
}

/**
 * Guarda el horario semanal de un médico para el portal público de auto-agendamiento
 * (tabla doctor_schedules), por SEDE: `locationId` null = horario general del médico;
 * con sede = horario propio de esa clínica (el portal usa el de la sede del link si
 * existe, si no cae al general). Reemplaza los rangos de ese médico+sede por los
 * recibidos (delete + insert: configuración de bajo volumen; si falla, se reintenta).
 * Solo afecta qué slots ofrece el portal público; la agenda interna no cambia.
 */
export async function saveDoctorSchedule(
  doctorId: string,
  locationId: string | null,
  ranges: { weekday: number; start: string; end: string }[],
) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado' }

  const supabase = await createClient()

  // El médico debe ser de la clínica y tener rol clínico (mismo criterio que la agenda).
  const { data: doctor } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', doctorId)
    .eq('clinic_id', ctx.clinicId)
    .in('role', ['ADMIN', 'DOCTOR'])
    .maybeSingle()
  if (!doctor) return { error: 'Médico no válido.' }

  if (locationId) {
    const { data: location } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('clinic_id', ctx.clinicId)
      .maybeSingle()
    if (!location) return { error: 'Clínica (sede) no válida.' }
  }

  const rangesError = validateScheduleRanges(ranges)
  if (rangesError) return { error: rangesError }

  let deleteQuery = supabase
    .from('doctor_schedules')
    .delete()
    .eq('doctor_id', doctorId)
    .eq('clinic_id', ctx.clinicId)
  deleteQuery = locationId ? deleteQuery.eq('location_id', locationId) : deleteQuery.is('location_id', null)
  const { error: deleteError } = await deleteQuery
  if (deleteError) return { error: safeErrorMessage('No se pudo actualizar el horario.', 'saveDoctorSchedule', deleteError) }

  if (ranges.length > 0) {
    const { error: insertError } = await supabase
      .from('doctor_schedules')
      .insert(ranges.map(r => ({
        clinic_id: ctx.clinicId,
        doctor_id: doctorId,
        location_id: locationId,
        weekday: r.weekday,
        start_time: r.start,
        end_time: r.end,
      })))
    if (insertError) return { error: safeErrorMessage('No se pudo guardar el horario.', 'saveDoctorSchedule', insertError) }
  }

  revalidatePath('/dashboard/config')
  return { success: true }
}

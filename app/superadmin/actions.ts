'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { provisionUserAccount, resendUserInvite } from '@/utils/provisioning'
import { provisionUserWithPassword } from '@/utils/provisioning-credentials'
import { DEFAULT_LAB_CATALOG } from '@/utils/labCatalog'
import { DEFAULT_STUDY_CATALOG } from '@/utils/studyCatalog'
import { safeErrorMessage } from '@/utils/errors'
import { revalidatePath } from 'next/cache'

/** Siembra el catálogo estándar de laboratorio para una clínica recién creada (best-effort). */
async function seedLabCatalogForClinic(admin: ReturnType<typeof createAdminClient>, clinicId: string) {
  try {
    for (let c = 0; c < DEFAULT_LAB_CATALOG.length; c++) {
      const cat = DEFAULT_LAB_CATALOG[c]
      const { data: catRow } = await admin
        .from('lab_test_categories')
        .insert([{ clinic_id: clinicId, name: cat.category, sort_order: c }])
        .select('id')
        .single()
      if (!catRow) continue
      await admin.from('lab_tests').insert(
        cat.tests.map((name, i) => ({ clinic_id: clinicId, category_id: catRow.id, name, sort_order: i }))
      )
    }
  } catch (e) {
    console.error('No se pudo sembrar el catálogo de laboratorio para la clínica', clinicId, e)
  }
}

/** Siembra el catálogo estándar de estudios para una clínica recién creada (best-effort). */
async function seedStudyCatalogForClinic(admin: ReturnType<typeof createAdminClient>, clinicId: string) {
  try {
    for (let s = 0; s < DEFAULT_STUDY_CATALOG.length; s++) {
      const sec = DEFAULT_STUDY_CATALOG[s]
      const { data: secRow } = await admin
        .from('study_sections')
        .insert([{ clinic_id: clinicId, name: sec.section, sort_order: s }])
        .select('id')
        .single()
      if (!secRow) continue
      await admin.from('study_catalog').insert(
        sec.studies.map((st, i) => ({
          clinic_id: clinicId,
          section_id: secRow.id,
          name: st.name,
          description: st.description || null,
          patient_indication: st.indication || null,
          sort_order: i,
        }))
      )
    }
  } catch (e) {
    console.error('No se pudo sembrar el catálogo de estudios para la clínica', clinicId, e)
  }
}

/**
 * Verifica que el llamante es platform admin usando el RPC del lado del servidor.
 * Devuelve el id del usuario actor (para auditoría) o lanza si no está autorizado.
 */
async function assertPlatformAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado')

  const { data: isAdmin, error } = await supabase.rpc('is_platform_admin')
  if (error || !isAdmin) throw new Error('No autorizado')

  return user.id
}

async function logPlatformEvent(
  actorUserId: string,
  action: string,
  fields: { targetClinicId?: string; targetUserId?: string; metadata?: Record<string, unknown> }
) {
  const admin = createAdminClient()
  await admin.from('platform_audit_logs').insert([{
    actor_user_id: actorUserId,
    action,
    target_clinic_id: fields.targetClinicId || null,
    target_user_id: fields.targetUserId || null,
    metadata: fields.metadata || null,
  }])
}

/**
 * Crea una nueva clínica (tenant) con su dueño/administrador.
 * El dueño recibe un email con enlace de un solo uso para fijar su contraseña.
 */
export async function provisionTenant(formData: FormData) {
  let actorUserId: string
  try {
    actorUserId = await assertPlatformAdmin()
  } catch {
    return { error: 'No autorizado.' }
  }

  const clinicName = (formData.get('clinicName') as string || '').trim()
  const ownerEmail = (formData.get('ownerEmail') as string || '').trim().toLowerCase()
  const ownerFirstName = (formData.get('ownerFirstName') as string || '').trim()
  const ownerLastName = (formData.get('ownerLastName') as string || '').trim()
  const planCode = (formData.get('planCode') as string || '').trim()
  const specialty = (formData.get('specialty') as string || '').trim()
  const professionalId = (formData.get('professionalId') as string || '').trim()

  if (!clinicName || !ownerEmail || !ownerFirstName || !ownerLastName || !planCode) {
    return { error: 'Nombre de la organización, datos del dueño y plan son obligatorios.' }
  }

  const admin = createAdminClient()

  // Validar que el plan exista.
  const { data: plan } = await admin.from('plans').select('code').eq('code', planCode).single()
  if (!plan) return { error: 'El plan seleccionado no es válido.' }

  // 1. Crear la organización (tenant).
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .insert([{ name: clinicName, plan_code: planCode }])
    .select()
    .single()
  if (clinicError || !clinic) {
    return { error: `No se pudo crear la organización: ${clinicError?.message}` }
  }

  // 2. Crear la clínica principal por defecto.
  const { data: location, error: locationError } = await admin
    .from('locations')
    .insert([{ clinic_id: clinic.id, name: 'Clínica Principal', is_active: true }])
    .select()
    .single()
  if (locationError || !location) {
    await admin.from('clinics').delete().eq('id', clinic.id)
    return { error: `No se pudo crear la clínica: ${locationError?.message}` }
  }

  // 2.b Sembrar los catálogos estándar (best-effort; no abortan la provisión).
  await seedLabCatalogForClinic(admin, clinic.id)
  await seedStudyCatalogForClinic(admin, clinic.id)

  // 3. Crear y enlazar al dueño (org admin) + enviar enlace de fijar contraseña.
  const result = await provisionUserAccount({
    email: ownerEmail,
    firstName: ownerFirstName,
    lastName: ownerLastName,
    clinicId: clinic.id,
    clinicName,
    role: 'DOCTOR',
    isOrgAdmin: true,
    specialty: specialty || 'Medicina General',
    professionalId: professionalId || null,
    defaultLocationId: location.id,
  })

  if (result.error || !result.userId) {
    // Revertir organización + clínica para no dejar tenants huérfanos.
    await admin.from('locations').delete().eq('clinic_id', clinic.id)
    await admin.from('clinics').delete().eq('id', clinic.id)
    return { error: result.error || 'No se pudo crear la cuenta del dueño.' }
  }

  // 4. Fijar al dueño en la clínica.
  await admin.from('clinics').update({ owner_user_id: result.userId }).eq('id', clinic.id)

  // 5. Auditoría.
  await logPlatformEvent(actorUserId, 'PROVISION_TENANT', {
    targetClinicId: clinic.id,
    targetUserId: result.userId,
    metadata: { clinicName, planCode, ownerEmail },
  })

  revalidatePath('/superadmin')
  return {
    success: true,
    warning: result.emailError ? `Cuenta creada, pero el email falló: ${result.emailError}` : undefined,
  }
}

/**
 * Cambia la licencia (plan) de una clínica. Solo platform admin.
 * Pasa el trigger guard_clinic_changes porque la conexión es service_role.
 */
export async function setClinicPlan(clinicId: string, planCode: string) {
  let actorUserId: string
  try {
    actorUserId = await assertPlatformAdmin()
  } catch {
    return { error: 'No autorizado.' }
  }

  if (!clinicId || !planCode) return { error: 'Datos incompletos.' }

  const admin = createAdminClient()

  const { data: plan } = await admin.from('plans').select('code').eq('code', planCode).single()
  if (!plan) return { error: 'El plan seleccionado no es válido.' }

  const { error } = await admin.from('clinics').update({ plan_code: planCode }).eq('id', clinicId)
  if (error) return { error: safeErrorMessage('No se pudo cambiar el plan.', 'setClinicPlan', error) }

  await logPlatformEvent(actorUserId, 'CHANGE_PLAN', {
    targetClinicId: clinicId,
    metadata: { planCode },
  })

  revalidatePath('/superadmin')
  return { success: true }
}

export interface ClinicLimitsInput {
  maxDoctors: number | null
  maxAssistants: number | null
  maxLocations: number | null
  maxStorageMb: number | null
}

/**
 * Fija los topes por-tenant (override de los del plan). Solo platform admin.
 * `null` en cualquier campo = limpiar el override (el tenant vuelve a heredar el plan).
 * Mismo patrón seguro que setClinicPlan: service_role (pasa guard_clinic_changes) + auditoría.
 */
export async function setClinicLimits(clinicId: string, limits: ClinicLimitsInput) {
  let actorUserId: string
  try {
    actorUserId = await assertPlatformAdmin()
  } catch {
    return { error: 'No autorizado.' }
  }

  if (!clinicId) return { error: 'Falta la clínica.' }

  // Normaliza: null = heredar; si viene número debe ser entero ≥ 1.
  const normalize = (v: number | null, label: string): number | null | { error: string } => {
    if (v == null) return null
    if (!Number.isInteger(v) || v < 1) return { error: `${label} debe ser un entero ≥ 1 (o vacío para heredar el plan).` }
    return v
  }

  const fields: Array<[keyof ClinicLimitsInput, string, string]> = [
    ['maxDoctors', 'max_doctors_override', 'Médicos'],
    ['maxAssistants', 'max_assistants_override', 'Asistentes'],
    ['maxLocations', 'max_locations_override', 'Clínicas'],
    ['maxStorageMb', 'max_storage_mb_override', 'Almacenamiento'],
  ]

  const update: Record<string, number | null> = {}
  for (const [key, column, label] of fields) {
    const result = normalize(limits[key], label)
    if (result !== null && typeof result === 'object') return { error: result.error }
    update[column] = result
  }

  const admin = createAdminClient()
  const { error } = await admin.from('clinics').update(update).eq('id', clinicId)
  if (error) return { error: safeErrorMessage('No se pudieron guardar los límites.', 'setClinicLimits', error) }

  await logPlatformEvent(actorUserId, 'SET_CLINIC_LIMITS', {
    targetClinicId: clinicId,
    metadata: update,
  })

  revalidatePath('/superadmin')
  return { success: true }
}

/**
 * Reenvía el enlace de activación al dueño de una clínica que aún no fijó su contraseña.
 */
export async function resendOwnerInvite(clinicId: string) {
  let actorUserId: string
  try {
    actorUserId = await assertPlatformAdmin()
  } catch {
    return { error: 'No autorizado.' }
  }

  const admin = createAdminClient()

  const { data: clinic } = await admin
    .from('clinics')
    .select('id, name, owner_user_id')
    .eq('id', clinicId)
    .single()
  if (!clinic?.owner_user_id) return { error: 'Esta clínica no tiene un dueño asignado.' }

  const { data: owner } = await admin
    .from('user_profiles')
    .select('id, first_name, role')
    .eq('id', clinic.owner_user_id)
    .single()

  const { data: authUser } = await admin.auth.admin.getUserById(clinic.owner_user_id)
  const email = authUser?.user?.email
  if (!email) return { error: 'No se encontró el correo del dueño.' }

  const result = await resendUserInvite({
    userId: clinic.owner_user_id,
    email,
    firstName: owner?.first_name || 'Usuario',
    clinicName: clinic.name,
    role: owner?.role || 'DOCTOR',
  })
  if (result.error) return { error: result.error }

  await logPlatformEvent(actorUserId, 'RESEND_INVITE', {
    targetClinicId: clinicId,
    targetUserId: clinic.owner_user_id,
  })

  return { success: true }
}

export interface TeamMemberInput {
  firstName: string
  lastName: string
  email: string
  password: string
  role: 'DOCTOR' | 'ASSISTANT' | 'ADMIN'
  specialty?: string
  professionalId?: string
  isOrgAdmin: boolean
}

/**
 * Crea una clínica con su equipo completo usando contraseñas predefinidas.
 * Cada miembro recibe un correo con sus credenciales listas para usar.
 * Útil para clientes institucionales que prefieren no gestionar el onboarding ellos mismos.
 */
export async function provisionTenantWithTeam(formData: FormData) {
  let actorUserId: string
  try {
    actorUserId = await assertPlatformAdmin()
  } catch {
    return { error: 'No autorizado.' }
  }

  const clinicName = (formData.get('clinicName') as string || '').trim()
  const clinicPhone = (formData.get('clinicPhone') as string || '').trim()
  const clinicAddress = (formData.get('clinicAddress') as string || '').trim()
  const planCode = (formData.get('planCode') as string || '').trim()
  const teamJson = (formData.get('teamMembers') as string || '').trim()

  if (!clinicName || !planCode || !teamJson) {
    return { error: 'Nombre de la organización, plan y al menos un miembro del equipo son obligatorios.' }
  }

  let teamMembers: TeamMemberInput[]
  try {
    teamMembers = JSON.parse(teamJson)
    if (!Array.isArray(teamMembers) || teamMembers.length === 0) throw new Error()
  } catch {
    return { error: 'El equipo no tiene el formato correcto.' }
  }

  const admin = createAdminClient()

  const { data: plan } = await admin.from('plans').select('code').eq('code', planCode).single()
  if (!plan) return { error: 'El plan seleccionado no es válido.' }

  // 1. Crear la organización con teléfono y dirección.
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .insert([{ name: clinicName, plan_code: planCode, phone: clinicPhone || null, address: clinicAddress || null }])
    .select()
    .single()
  if (clinicError || !clinic) {
    return { error: `No se pudo crear la organización: ${clinicError?.message}` }
  }

  // 2. Crear la sede principal.
  const { data: location, error: locationError } = await admin
    .from('locations')
    .insert([{ clinic_id: clinic.id, name: 'Consultorio Principal', is_active: true }])
    .select()
    .single()
  if (locationError || !location) {
    await admin.from('clinics').delete().eq('id', clinic.id)
    return { error: `No se pudo crear la sede: ${locationError?.message}` }
  }

  // 2.b Catálogo estándar de laboratorio (best-effort), igual que provisionTenant.
  await seedLabCatalogForClinic(admin, clinic.id)

  // 3. Crear cada miembro del equipo.
  const results: { name: string; email: string; error?: string; emailError?: string }[] = []
  let ownerUserId: string | undefined

  for (const member of teamMembers) {
    const result = await provisionUserWithPassword({
      email: member.email.trim().toLowerCase(),
      password: member.password,
      firstName: member.firstName.trim(),
      lastName: member.lastName.trim(),
      clinicId: clinic.id,
      clinicName,
      role: member.role,
      isOrgAdmin: !!member.isOrgAdmin,
      specialty: member.specialty || null,
      professionalId: member.professionalId || null,
      defaultLocationId: location.id,
    })

    results.push({
      name: `${member.firstName} ${member.lastName}`,
      email: member.email,
      error: result.error,
      emailError: result.emailError,
    })

    if (!ownerUserId && member.isOrgAdmin && result.userId) {
      ownerUserId = result.userId
    }
  }

  // 4. Fijar el dueño (primer miembro con isOrgAdmin).
  if (ownerUserId) {
    await admin.from('clinics').update({ owner_user_id: ownerUserId }).eq('id', clinic.id)
  }

  // 5. Auditoría.
  await logPlatformEvent(actorUserId, 'PROVISION_TENANT_WITH_TEAM', {
    targetClinicId: clinic.id,
    targetUserId: ownerUserId,
    metadata: { clinicName, planCode, members: results.map(r => r.email) },
  })

  revalidatePath('/superadmin')

  const errors = results.filter(r => r.error)
  const emailErrors = results.filter(r => !r.error && r.emailError)

  if (errors.length > 0) {
    return { error: `Algunos usuarios no pudieron crearse: ${errors.map(r => `${r.name} (${r.error})`).join('; ')}` }
  }

  return {
    success: true,
    warning: emailErrors.length > 0
      ? `Equipo creado, pero algunos correos fallaron: ${emailErrors.map(r => r.name).join(', ')}`
      : undefined,
  }
}

'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { provisionUserAccount, resendUserInvite } from '@/utils/provisioning'
import { provisionUserWithPassword } from '@/utils/provisioning-credentials'
import { revalidatePath } from 'next/cache'

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
  if (error) return { error: `No se pudo cambiar el plan: ${error.message}` }

  await logPlatformEvent(actorUserId, 'CHANGE_PLAN', {
    targetClinicId: clinicId,
    metadata: { planCode },
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

'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { provisionUserAccount, resendUserInvite } from '@/utils/provisioning'
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
    return { error: 'Nombre de clínica, datos del dueño y plan son obligatorios.' }
  }

  const admin = createAdminClient()

  // Validar que el plan exista.
  const { data: plan } = await admin.from('plans').select('code').eq('code', planCode).single()
  if (!plan) return { error: 'El plan seleccionado no es válido.' }

  // 1. Crear la clínica.
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .insert([{ name: clinicName, plan_code: planCode }])
    .select()
    .single()
  if (clinicError || !clinic) {
    return { error: `No se pudo crear la clínica: ${clinicError?.message}` }
  }

  // 2. Crear la sucursal principal por defecto.
  const { data: location, error: locationError } = await admin
    .from('locations')
    .insert([{ clinic_id: clinic.id, name: 'Consultorio Principal', is_active: true }])
    .select()
    .single()
  if (locationError || !location) {
    await admin.from('clinics').delete().eq('id', clinic.id)
    return { error: `No se pudo crear la sucursal: ${locationError?.message}` }
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
    // Revertir clínica + sucursal para no dejar tenants huérfanos.
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

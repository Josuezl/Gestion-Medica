'use server'

import { createClient } from '@/utils/supabase/server'
import { requireOrgAdmin } from '@/utils/auth-guard'
import { provisionUserAccount } from '@/utils/provisioning'
import { revalidatePath } from 'next/cache'

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

  if (!firstName || !lastName || !email || !role) {
    return { error: 'Nombre, apellido, correo y rol son requeridos.' }
  }
  if (role !== 'DOCTOR' && role !== 'ASSISTANT') {
    return { error: 'Rol no válido.' }
  }

  const supabase = await createClient()

  // Verificar topes del plan ANTES de crear la cuenta.
  const { data: planData } = await supabase
    .from('plans')
    .select('*')
    .eq('code', ctx.planCode)
    .single()

  if (planData) {
    const { count: currentUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinicId)
      .eq('role', role)

    const maxAllowed = role === 'DOCTOR' ? planData.max_doctors : planData.max_assistants

    if (currentUsers !== null && currentUsers >= maxAllowed) {
      return { error: `Has alcanzado el límite de ${maxAllowed} usuarios con rol ${role} para tu plan ${planData.name}.` }
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

  if (!name) return { error: 'El nombre de la clínica es requerido' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('clinics')
    .update({ name, phone, address })
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

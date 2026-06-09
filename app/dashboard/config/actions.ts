'use server'

import { createClient } from '@/utils/supabase/server'
import { requireRole, requireOrgAdmin } from '@/utils/auth-guard'
import { sendInvitationEmail } from '@/utils/email-invitation'
import { revalidatePath } from 'next/cache'

export async function upgradeToClinicPlan() {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado.' }
  
  const supabase = await createClient()
  const { error } = await supabase
    .from('clinics')
    .update({ plan_code: 'HOSPITAL' })
    .eq('id', ctx.clinicId)
    
  if (error) return { error: error.message }
  
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/config')
  return { success: true }
}

export async function sendInvitation(formData: FormData) {
  const ctx = await requireOrgAdmin()
  if (!ctx) return { error: 'No autorizado. Solo los administradores de la organización pueden enviar invitaciones.' }

  const email = formData.get('email') as string
  const role = formData.get('role') as string
  const specialty = formData.get('specialty') as string

  if (!email || !role) return { error: 'Email y rol son requeridos' }

  const supabase = await createClient()

  // Verify limits based on plan
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

  // Check existing active invitation
  const { data: existing } = await supabase
    .from('clinic_invitations')
    .select('id')
    .eq('clinic_id', ctx.clinicId)
    .eq('email', email)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (existing) {
    return { error: 'Ya existe una invitación pendiente para este correo' }
  }

  // Insert invitation
  const { data: inv, error: insertError } = await supabase
    .from('clinic_invitations')
    .insert([{
      clinic_id: ctx.clinicId,
      email,
      role,
      specialty: specialty || null,
      invited_by: ctx.user.id
    }])
    .select()
    .single()

  if (insertError) {
    return { error: 'Error al crear la invitación: ' + insertError.message }
  }

  // Send email
  const inviterName = `${ctx.profile.first_name} ${ctx.profile.last_name}`
  const emailResult = await sendInvitationEmail(
    email,
    ctx.clinicName,
    role,
    specialty || null,
    inviterName,
    inv.token
  )

  if (emailResult.error) {
    return { error: 'Invitación creada, pero hubo un error al enviar el correo: ' + emailResult.error }
  }

  revalidatePath('/dashboard/config')
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

  if (!name) return { error: 'El nombre de la sucursal es requerido' }

  const supabase = await createClient()

  // Verify limit
  const { data: planData } = await supabase
    .from('plans')
    .select('max_locations')
    .eq('code', ctx.planCode)
    .single()

  if (planData) {
    const { count: currentLocations } = await supabase
      .from('locations')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', ctx.clinicId)

    if (currentLocations !== null && currentLocations >= planData.max_locations) {
      return { error: `Límite alcanzado (${planData.max_locations} sucursales).` }
    }
  }

  const { error } = await supabase
    .from('locations')
    .insert([{
      clinic_id: ctx.clinicId,
      name,
      address: address || null
    }])

  if (error) return { error: 'Error al crear la sucursal: ' + error.message }
  
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

  if (error) return { error: 'Error al actualizar la sucursal: ' + error.message }
  
  revalidatePath('/dashboard/config')
  return { success: true }
}

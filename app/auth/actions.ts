'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'Credenciales inválidas. Por favor, verifica tu correo y contraseña.' }
  }

  redirect('/dashboard')
}

export async function getInvitationDetails(token: string) {
  const { createClient: createAdminClient } = require('@supabase/supabase-js')
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: inv, error } = await adminSupabase
    .from('clinic_invitations')
    .select('*, clinics(name)')
    .eq('token', token)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !inv) {
    return { error: 'Invitación no encontrada, inválida o expirada.' }
  }

  return {
    clinicName: inv.clinics?.name || '',
    role: inv.role,
    specialty: inv.specialty,
    email: inv.email
  }
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const clinicName = formData.get('clinicName') as string
  const professionalId = formData.get('professionalId') as string // CMH Honduras
  const specialty = formData.get('specialty') as string
  const inviteToken = formData.get('invite_token') as string

  const supabase = await createClient()
  const { createClient: createAdminClient } = require('@supabase/supabase-js')
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Validate invite if provided
  let invitationData: any = null
  if (inviteToken) {
    const { data: inv, error: invError } = await adminSupabase
      .from('clinic_invitations')
      .select('*')
      .eq('token', inviteToken)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .single()

    if (invError || !inv) {
      return { error: 'La invitación es inválida o ha expirado.' }
    }
    invitationData = inv
  }

  // 1. Registrar al usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        role: invitationData ? invitationData.role : 'ADMIN',
      },
    },
  })

  if (authError) {
    return { error: `Error en registro: ${authError.message}` }
  }

  const user = authData.user
  if (!user) {
    return { error: 'No se pudo crear el usuario.' }
  }

  // Handle Invited User
  if (invitationData) {
    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .update({
        clinic_id: invitationData.clinic_id,
        first_name: firstName,
        last_name: lastName,
        role: invitationData.role,
        specialty: specialty || invitationData.specialty || '',
        professional_id: professionalId,
      })
      .eq('id', user.id)

    if (profileError) return { error: `Error al actualizar perfil: ${profileError.message}` }

    const { error: invUpdateError } = await adminSupabase
      .from('clinic_invitations')
      .update({ status: 'ACCEPTED' })
      .eq('id', invitationData.id)

    if (invUpdateError) return { error: `Error al procesar invitación: ${invUpdateError.message}` }
  } else {
    // Handle New Clinic Admin
    const { data: clinicData, error: clinicError } = await adminSupabase
      .from('clinics')
      .insert([{ name: clinicName }])
      .select()
      .single()

    if (clinicError) return { error: `Error al crear la clínica: ${clinicError.message}` }

    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .update({
        clinic_id: clinicData.id,
        first_name: firstName,
        last_name: lastName,
        role: 'ADMIN',
        specialty: specialty || 'Medicina General',
        professional_id: professionalId,
      })
      .eq('id', user.id)

    if (profileError) return { error: `Error al actualizar perfil: ${profileError.message}` }
  }

  // Iniciar sesión automáticamente después del registro
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    return { error: 'Registro exitoso, pero ocurrió un error al iniciar sesión automáticamente. Por favor, inicia sesión de forma manual.' }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}


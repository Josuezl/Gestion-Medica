import { createAdminClient } from '@/utils/supabase/admin'
import { sendWelcomeCredentialsEmail } from '@/utils/email-invitation'
import { safeErrorMessage } from '@/utils/errors'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export interface ProvisionWithPasswordParams {
  email: string
  password: string
  firstName: string
  lastName: string
  clinicId: string
  clinicName: string
  role: 'DOCTOR' | 'ASSISTANT' | 'ADMIN'
  isOrgAdmin: boolean
  specialty?: string | null
  professionalId?: string | null
  defaultLocationId?: string | null
}

export interface ProvisionWithPasswordResult {
  userId?: string
  error?: string
  emailError?: string
}

/**
 * Crea un usuario con contraseña ya fijada (no invite link) y envía
 * un correo de bienvenida con sus credenciales de acceso.
 * Solo debe invocarse desde Server Actions que ya validaron autorización.
 */
export async function provisionUserWithPassword(
  params: ProvisionWithPasswordParams
): Promise<ProvisionWithPasswordResult> {
  const admin = createAdminClient()

  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
  })

  if (createError || !userData?.user) {
    return { error: createError?.message || 'No se pudo crear la cuenta.' }
  }

  const userId = userData.user.id

  const { error: profileError } = await admin
    .from('user_profiles')
    .update({
      clinic_id: params.clinicId,
      first_name: params.firstName,
      last_name: params.lastName,
      role: params.role,
      is_org_admin: params.isOrgAdmin,
      specialty: params.specialty || null,
      professional_id: params.professionalId || null,
      default_location_id: params.defaultLocationId || null,
    })
    .eq('id', userId)

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: safeErrorMessage('No se pudo configurar el perfil del usuario.', 'provisionUserWithPassword', profileError) }
  }

  const emailResult = await sendWelcomeCredentialsEmail({
    toEmail: params.email,
    firstName: params.firstName,
    clinicName: params.clinicName,
    role: params.role,
    loginEmail: params.email,
    password: params.password,
    loginUrl: `${SITE_URL}/login`,
  })

  return { userId, emailError: emailResult.error }
}

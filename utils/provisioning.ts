import { createAdminClient } from '@/utils/supabase/admin'
import { sendSetPasswordEmail } from '@/utils/email-invitation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export interface ProvisionParams {
  email: string
  firstName: string
  lastName: string
  clinicId: string
  clinicName: string
  role: 'DOCTOR' | 'ASSISTANT' | 'ADMIN'
  isOrgAdmin: boolean
  specialty?: string | null
  professionalId?: string | null
  defaultLocationId?: string | null
  inviterName?: string | null
}

export interface ProvisionResult {
  userId?: string
  error?: string
  emailError?: string
}

/**
 * Crea una cuenta de Auth con SERVICE_ROLE, la enlaza a su clínica/rol y envía un email
 * con un enlace de un solo uso para que la persona fije su propia contraseña.
 *
 * Debe invocarse SOLO desde Server Actions que ya validaron autorización
 * (is_platform_admin para el dueño de la clínica; requireOrgAdmin para el equipo).
 */
export async function provisionUserAccount(params: ProvisionParams): Promise<ProvisionResult> {
  const admin = createAdminClient()

  // 1. Crear el usuario y obtener el token del enlace de invitación (sin contraseña aún).
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: params.email,
    options: { redirectTo: `${SITE_URL}/auth/confirm` },
  })

  if (linkError || !linkData?.user || !linkData.properties?.hashed_token) {
    return { error: linkError?.message || 'No se pudo crear la cuenta de acceso.' }
  }

  const userId = linkData.user.id
  const hashedToken = linkData.properties.hashed_token

  // 2. Enlazar el perfil. El trigger handle_new_user ya creó la fila base; aquí asignamos
  //    clinic_id/role/is_org_admin (permitido porque la conexión es service_role).
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
    // Revertir el usuario de Auth para no dejar cuentas huérfanas.
    await admin.auth.admin.deleteUser(userId)
    return { error: `No se pudo configurar el perfil: ${profileError.message}` }
  }

  // 3. Enviar email con nuestro propio enlace hacia /auth/confirm.
  const inviteLink = `${SITE_URL}/auth/confirm?token_hash=${hashedToken}&type=invite&next=/set-password`
  const emailResult = await sendSetPasswordEmail({
    toEmail: params.email,
    firstName: params.firstName,
    clinicName: params.clinicName,
    role: params.role,
    inviteLink,
    inviterName: params.inviterName,
  })

  return { userId, emailError: emailResult.error }
}

/**
 * Regenera el enlace de fijar-contraseña y reenvía el email a un usuario ya provisionado
 * que todavía no activó su cuenta.
 */
export async function resendUserInvite(params: {
  userId: string
  email: string
  firstName: string
  clinicName: string
  role: string
}): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: params.email,
    options: { redirectTo: `${SITE_URL}/auth/confirm` },
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return { error: linkError?.message || 'No se pudo regenerar el enlace.' }
  }

  const inviteLink = `${SITE_URL}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/set-password`
  const emailResult = await sendSetPasswordEmail({
    toEmail: params.email,
    firstName: params.firstName,
    clinicName: params.clinicName,
    role: params.role,
    inviteLink,
  })

  return { error: emailResult.error }
}

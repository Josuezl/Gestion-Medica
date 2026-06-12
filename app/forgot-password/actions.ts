'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { sendPasswordResetEmail } from '@/utils/email-invitation'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

/**
 * Solicita un enlace de reinicio de contraseña.
 *
 * Anti-enumeración: SIEMPRE responde de forma genérica, exista o no el correo,
 * para no revelar qué direcciones están registradas. El enlace (de un solo uso,
 * con expiración) se genera con la API admin y se envía por Resend.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get('email') as string || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    return { error: 'Ingresa un correo electrónico válido.' }
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${SITE_URL}/auth/confirm` },
    })

    // Solo enviamos si el usuario existe; si no, callamos (anti-enumeración).
    if (!error && data?.user && data.properties?.hashed_token) {
      const resetLink = `${SITE_URL}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/set-password`

      let firstName = 'Usuario'
      const { data: profile } = await admin
        .from('user_profiles')
        .select('first_name')
        .eq('id', data.user.id)
        .single()
      if (profile?.first_name) firstName = profile.first_name

      await sendPasswordResetEmail({ toEmail: email, firstName, resetLink })
    }
  } catch (e) {
    // No exponer detalles al cliente; el resultado siempre es genérico.
    console.error('[forgot-password] error generando enlace:', e)
  }

  // Respuesta genérica e idéntica en todos los casos.
  return { success: true }
}

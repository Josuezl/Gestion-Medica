'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function setPassword(formData: FormData) {
  const password = formData.get('password') as string
  const confirm = formData.get('confirmPassword') as string

  if (!password || password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' }
  }
  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.' }
  }

  const supabase = await createClient()

  // El usuario debe tener sesión activa (establecida por /auth/confirm tras verificar el enlace).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Tu enlace expiró o no es válido. Solicita uno nuevo al administrador.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: 'No se pudo guardar la contraseña. Intenta de nuevo.' }
  }

  // redirect lanza una excepción: debe ir fuera de cualquier try/catch.
  redirect('/dashboard/select-location')
}

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

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const clinicName = formData.get('clinicName') as string
  const professionalId = formData.get('professionalId') as string // CMH Honduras
  const specialty = formData.get('specialty') as string

  const supabase = await createClient()

  // 1. Registrar al usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        role: 'ADMIN', // El primer médico creador es Administrador de la clínica
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

  // 2. Crear la clínica
  // Para evitar fallos de RLS iniciales, podemos insertar usando un cliente de servicio, pero dado que el usuario está logueado en la sesión, si permitimos la inserción temporal de clínicas es mejor. 
  // Nota: En schema.sql la política de clinics permite CRUD si su id coincide con el clinic_id del perfil del doctor.
  // Pero al registrarse, el perfil del doctor tiene clinic_id NULL, por lo que no podría insertar una clínica directamente con esa política!
  // Para resolver esto elegantemente, crearemos la clínica y luego actualizaremos el perfil del usuario.
  // Usaremos una consulta directa de supabase o una inserción de bypass segura. 
  // Una forma muy estándar es crear un cliente con la clave de servicio (service role key) para esta operación administrativa de registro inicial:
  
  const { createClient: createAdminClient } = require('@supabase/supabase-js')
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Crear la clínica vía admin client
  const { data: clinicData, error: clinicError } = await adminSupabase
    .from('clinics')
    .insert([{ name: clinicName }])
    .select()
    .single()

  if (clinicError) {
    return { error: `Error al crear la clínica: ${clinicError.message}` }
  }

  // Actualizar el perfil recién creado por el trigger con el ID de la clínica y el rol ADMIN
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

  if (profileError) {
    return { error: `Error al actualizar perfil: ${profileError.message}` }
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

import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

/** Perfil del usuario autenticado con los campos que consumen layout, páginas y greeting. */
export interface SessionProfile {
  id: string
  clinic_id: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  is_org_admin: boolean | null
  specialty: string | null
  gender: string | null
  /** Join a-uno con clinics (la inferencia del cliente lo reporta como arreglo). */
  clinic_name: string | null
}

/**
 * Sesión + perfil del usuario, memoizados POR REQUEST con React.cache() (P1-2 de
 * revision_tecnica_2026-07-05.md). Antes, middleware aparte, cada render del dashboard
 * repetía getUser() (roundtrip al Auth server de Supabase) y el select de user_profiles
 * en layout, página y greeting: ahora esos tres comparten una sola llamada de cada una.
 *
 * Solo para el árbol de render (layouts/páginas RSC). Las server actions siguen validando
 * por su cuenta: son requests distintos y la validación de autorización debe ser local.
 */
export const getSessionProfile = cache(async () => {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_profiles')
    .select('id, clinic_id, first_name, last_name, role, is_org_admin, specialty, gender, clinics ( name )')
    .eq('id', user.id)
    .single()

  if (!data) return { user, profile: null }

  const clinicRef = data.clinics as unknown as { name?: string | null } | null
  const profile: SessionProfile = {
    id: data.id,
    clinic_id: data.clinic_id,
    first_name: data.first_name,
    last_name: data.last_name,
    role: data.role,
    is_org_admin: data.is_org_admin,
    specialty: data.specialty,
    gender: data.gender,
    clinic_name: clinicRef?.name ?? null,
  }
  return { user, profile }
})

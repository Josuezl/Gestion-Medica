'use server'

import { createClient } from '@/utils/supabase/server'
import { User } from '@supabase/supabase-js'

/** Fila de user_profiles con el join de clinics usado por el guard (solo columnas consumidas). */
export interface AuthProfile {
  id: string
  clinic_id: string
  first_name: string
  last_name: string
  role: string
  is_org_admin: boolean | null
  clinics: { name: string | null; plan_code: string | null } | null
}

export interface AuthContext {
  user: User
  profile: AuthProfile
  clinicId: string
  clinicName: string
  role: 'ADMIN' | 'DOCTOR' | 'ASSISTANT' | 'NURSE'
  isOrgAdmin: boolean
  planCode: string
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*, clinics(name, plan_code)')
    .eq('id', user.id)
    .single()

  if (error || !data) {
    console.log('[auth-guard] Error getting profile:', error)
    return null
  }

  const profile = data as AuthProfile
  return {
    user,
    profile,
    clinicId: profile.clinic_id,
    clinicName: profile.clinics?.name || '',
    role: profile.role as AuthContext['role'],
    isOrgAdmin: !!profile.is_org_admin,
    planCode: profile.clinics?.plan_code || 'SOLO_MEDICO',
  }
}

export async function requireRole(allowedRoles: string[]): Promise<AuthContext | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null
  const userRole = (ctx.role || '').toUpperCase().trim()
  const upperAllowedRoles = allowedRoles.map(r => r.toUpperCase().trim())
  
  if (!upperAllowedRoles.includes(userRole)) {
    console.log(`[auth-guard] Role mismatch: User has '${ctx.role}', allowed: ${allowedRoles.join(', ')}`)
    return null
  }
  return ctx
}
export async function requireOrgAdmin(): Promise<AuthContext | null> {
  const ctx = await getAuthContext()
  if (!ctx || !ctx.isOrgAdmin) return null
  return ctx
}

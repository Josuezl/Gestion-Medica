'use server'

import { createClient } from '@/utils/supabase/server'
import { User } from '@supabase/supabase-js'

export interface AuthContext {
  user: User
  profile: any
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

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('*, clinics(name, plan_code)')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    console.log('[auth-guard] Error getting profile:', error)
    return null
  }

  return {
    user,
    profile,
    clinicId: profile.clinic_id,
    clinicName: (profile.clinics as any)?.name || '',
    role: profile.role as 'ADMIN' | 'DOCTOR' | 'ASSISTANT',
    isOrgAdmin: !!profile.is_org_admin,
    planCode: (profile.clinics as any)?.plan_code || 'SOLO_MEDICO',
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

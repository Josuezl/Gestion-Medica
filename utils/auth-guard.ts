'use server'

import { createClient } from '@/utils/supabase/server'
import { User } from '@supabase/supabase-js'

export interface AuthContext {
  user: User
  profile: any
  clinicId: string
  clinicName: string
  role: 'ADMIN' | 'DOCTOR' | 'ASSISTANT'
  planType: string
  maxUsers: number
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, clinics(name, plan_type, max_users)')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return {
    user,
    profile,
    clinicId: profile.clinic_id,
    clinicName: (profile.clinics as any)?.name || '',
    role: profile.role as 'ADMIN' | 'DOCTOR' | 'ASSISTANT',
    planType: (profile.clinics as any)?.plan_type || 'standard',
    maxUsers: (profile.clinics as any)?.max_users || 10,
  }
}

export async function requireRole(allowedRoles: string[]): Promise<AuthContext | null> {
  const ctx = await getAuthContext()
  if (!ctx) return null
  if (!allowedRoles.includes(ctx.role)) return null
  return ctx
}

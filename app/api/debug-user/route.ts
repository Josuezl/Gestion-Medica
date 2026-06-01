import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ authenticated: false, error: authError?.message })
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: clinics, error: clinicsError } = await supabase
    .from('clinics')
    .select('*')

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    },
    profile,
    profileError: profileError?.message || null,
    allClinics: clinics || [],
    clinicsError: clinicsError?.message || null
  })
}

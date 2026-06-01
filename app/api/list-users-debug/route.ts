import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
  
  const { data: clinics, error: clinicError } = await supabase
    .from('clinics')
    .select('*')

  return NextResponse.json({
    profiles,
    clinics,
    errors: {
      profile: profileError?.message || null,
      clinic: clinicError?.message || null
    }
  })
}

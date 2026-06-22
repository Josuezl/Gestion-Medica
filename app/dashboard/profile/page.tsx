import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, gender, phone, role, specialty, professional_id, practice_name, practice_phone, practice_address')
    .eq('id', user.id)
    .single()

  return <ProfileClient profile={profile || {}} email={user.email || ''} />
}

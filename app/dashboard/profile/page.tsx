import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // select('*') para tolerar el drift repo↔BD: si `practice_logo_url` aún no existe (deploy antes del
  // DDL), no rompe la página (la columna simplemente no viene) en vez de fallar el query completo.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return <ProfileClient profile={profile || {}} email={user.email || ''} />
}

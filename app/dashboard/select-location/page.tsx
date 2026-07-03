import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SelectLocationClient from './SelectLocationClient'
import { firstWord, doctorTitle } from '@/utils/doctorName'

export default async function SelectLocationPage() {
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, clinic_id, first_name, last_name, role, gender')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) {
    redirect('/dashboard') // Si no tiene clínica, dejamos que el dashboard lo maneje
  }

  // 2. Obtener todas las clínicas (locations) activas para este tenant
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name, address')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const validLocations = locations || []

  // 3. Lógica inteligente: Si solo hay 1 clínica, lo pasamos directo
  // Nota: No podemos usar cookies().set() en un Server Component durante el renderizado en Next.js.
  // Pero al redirigir sin cookie, el sistema usará 'all' por defecto, lo cual está bien si solo hay 1 clínica.
  if (validLocations.length === 1) {
    redirect('/dashboard')
  }

  // Si no hay clínicas configuradas (ej. cuenta antigua), lo mandamos directo
  if (validLocations.length === 0) {
    redirect('/dashboard')
  }

  // 4. Si hay múltiples, mostramos la UI para que elija
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', color: '#0f172a', margin: '0 0 0.5rem' }}>Bienvenido, {profile.role === 'DOCTOR' ? `${doctorTitle(profile.gender)} ` : ''}{firstWord(profile.first_name)}</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '1.1rem' }}>¿En cuál clínica vas a trabajar hoy?</p>
        </div>
        
        <SelectLocationClient locations={validLocations} />
      </div>
    </div>
  )
}

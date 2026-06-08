import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth-guard'
import ConfigClient from './ConfigClient'
import { Settings } from 'lucide-react'

export default async function ConfigPage() {
  const ctx = await requireRole(['ADMIN'])
  
  if (!ctx) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo los administradores de la clínica pueden acceder a esta configuración.</p>
      </div>
    )
  }

  const supabase = await createClient()

  // Load clinic details
  const { data: clinic } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', ctx.clinicId)
    .single()

  // Load team members
  const { data: teamMembers } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('created_at', { ascending: true })

  // Load pending invitations
  const { data: invitations } = await supabase
    .from('clinic_invitations')
    .select('*, invited_by_user:user_profiles!invited_by(first_name, last_name)')
    .eq('clinic_id', ctx.clinicId)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Settings size={24} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Configuración de Clínica</h2>
      </div>

      <ConfigClient 
        clinic={clinic}
        teamMembers={teamMembers || []}
        invitations={invitations || []}
        currentUserId={ctx.user.id}
        maxUsers={ctx.maxUsers}
      />
    </div>
  )
}

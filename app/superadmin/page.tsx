import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SuperAdminClient from './SuperAdminClient'

export default async function SuperAdminPage() {
  const supabase = await createClient()

  // 1. Autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Autorización: solo platform admin (el RPC se autoprotege saltando RLS)
  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (!isPlatformAdmin) redirect('/dashboard')

  // 3. Métricas, tenants y catálogo de planes
  const { data: summary } = await supabase.rpc('admin_platform_summary')
  const { data: tenants } = await supabase.rpc('admin_tenant_overview')
  const { data: plans } = await supabase.from('plans').select('code, name').eq('is_active', true).order('code')

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>SuperAdmin Dashboard</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>Provisión y control de licencias de CloudMedHN</p>
      </header>

      <SuperAdminClient
        summary={summary || null}
        tenants={tenants || []}
        plans={plans || []}
      />
    </div>
  )
}

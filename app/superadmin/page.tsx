import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import SuperAdminClient, { type TenantLimits } from './SuperAdminClient'

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

  // 4. Límites efectivos por tenant: override por-clínica + topes del plan.
  //    Se lee con el admin client (service_role) porque la RLS de clinics restringe a la
  //    propia clínica; este page ya está protegido por is_platform_admin arriba.
  const admin = createAdminClient()
  const [{ data: clinicRows }, { data: planRows }] = await Promise.all([
    admin.from('clinics').select(
      'id, plan_code, max_doctors_override, max_assistants_override, max_locations_override, max_storage_mb_override',
    ),
    admin.from('plans').select('code, max_doctors, max_assistants, max_locations, max_storage_mb'),
  ])

  const planByCode = new Map((planRows || []).map((p) => [p.code, p]))
  const tenantLimits: Record<string, TenantLimits> = {}
  for (const c of clinicRows || []) {
    const plan = planByCode.get(c.plan_code)
    tenantLimits[c.id] = {
      plan: {
        maxDoctors: plan?.max_doctors ?? null,
        maxAssistants: plan?.max_assistants ?? null,
        maxLocations: plan?.max_locations ?? null,
        maxStorageMb: plan?.max_storage_mb ?? null,
      },
      override: {
        maxDoctors: c.max_doctors_override,
        maxAssistants: c.max_assistants_override,
        maxLocations: c.max_locations_override,
        maxStorageMb: c.max_storage_mb_override,
      },
    }
  }

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
        tenantLimits={tenantLimits}
      />
    </div>
  )
}

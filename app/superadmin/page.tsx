import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function SuperAdminPage() {
  const supabase = await createClient()

  // 1. Verificar si el usuario está autenticado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 2. Verificar si es Platform Admin (SuperAdmin) usando el RPC para saltar RLS
  const { data: isPlatformAdmin, error: adminCheckError } = await supabase.rpc('is_platform_admin')

  if (!isPlatformAdmin) {
    console.log('User is not superadmin:', adminCheckError)
    redirect('/dashboard') // Redirigir al dashboard normal si no es SuperAdmin
  }

  // 3. Obtener métricas desde la función RPC creada en la Fase 5
  // Asume que la función se llama admin_platform_summary()
  const { data: summary, error: summaryError } = await supabase.rpc('admin_platform_summary')
  const { data: tenants, error: tenantsError } = await supabase.rpc('admin_tenant_overview')

  if (summaryError || tenantsError) {
    console.error('Error fetching admin data:', summaryError || tenantsError)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>SuperAdmin Dashboard</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#64748b' }}>Visión global de CloudMedHN SaaS</p>
      </header>

      {/* Tarjetas de Métricas (Summary) */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          <MetricCard title="Organizaciones" value={summary.total_orgs} />
          <MetricCard title="Médicos" value={summary.total_medicos} />
          <MetricCard title="Asistentes" value={summary.total_asistentes} />
          <MetricCard title="Pacientes" value={summary.total_pacientes} />
          <MetricCard 
            title="Almacenamiento (MB)" 
            value={Math.round((summary.almacenamiento_bytes || 0) / (1024 * 1024))} 
          />
        </div>
      )}

      {/* Lista de Tenants */}
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#0f172a' }}>Clientes (Tenants)</h2>
      <div style={{ overflowX: 'auto', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '1rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Clínica / Hospital</th>
              <th style={{ padding: '0.75rem 1rem' }}>Plan</th>
              <th style={{ padding: '0.75rem 1rem' }}>Médicos</th>
              <th style={{ padding: '0.75rem 1rem' }}>Asistentes</th>
              <th style={{ padding: '0.75rem 1rem' }}>Pacientes</th>
              <th style={{ padding: '0.75rem 1rem' }}>Storage (MB)</th>
              <th style={{ padding: '0.75rem 1rem' }}>Registrado</th>
            </tr>
          </thead>
          <tbody>
            {tenants?.map((tenant: any) => (
              <tr key={tenant.clinic_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                  {tenant.clinic_name}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{ 
                    background: tenant.plan_code === 'HOSPITAL' ? '#dbeafe' : '#fef9c3', 
                    color: tenant.plan_code === 'HOSPITAL' ? '#1e40af' : '#854d0e',
                    padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 
                  }}>
                    {tenant.plan_code}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>{tenant.doctors}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{tenant.assistants}</td>
                <td style={{ padding: '0.75rem 1rem' }}>{tenant.patients}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {Math.round((tenant.storage_bytes || 0) / (1024 * 1024))} MB
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                  {new Date(tenant.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {(!tenants || tenants.length === 0) && (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  No hay organizaciones registradas aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ title, value }: { title: string, value: number | string }) {
  return (
    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>{title}</h3>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
    </div>
  )
}

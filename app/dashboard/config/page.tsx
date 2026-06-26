import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { requireOrgAdmin } from '@/utils/auth-guard'
import { effectiveLimit, canInviteDoctors, canManageLocations } from '@/utils/clinicLimits'
import ConfigClient from './ConfigClient'
import { ensureStudyCatalogSeeded } from '@/utils/ensureStudyCatalog'
import { Settings } from 'lucide-react'

export default async function ConfigPage() {
  const ctx = await requireOrgAdmin()
  
  if (!ctx) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo los administradores de la organización pueden acceder a esta configuración.</p>
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

  // Load plan details
  const { data: planData } = await supabase
    .from('plans')
    .select('*')
    .eq('code', ctx.planCode)
    .single()

  // Topes efectivos = override por-clínica (si existe) o el del plan. El superadmin
  // ajusta los overrides; NULL = heredar el plan. Misma regla que aplica el trigger SQL.
  const maxDoctors = effectiveLimit(clinic?.max_doctors_override, planData?.max_doctors) ?? 1
  const maxAssistants = effectiveLimit(clinic?.max_assistants_override, planData?.max_assistants) ?? 5
  const doctorsEnabled = canInviteDoctors(maxDoctors)

  // Gestión de clínicas (locations): por plan solo la tiene SOLO_MEDICO, pero un
  // override por-clínica (clinics.max_locations_override) la habilita para un tenant
  // puntual y fija su tope, sin cambiar el plan. NULL = comportamiento por plan.
  const locationsOverride = (clinic?.max_locations_override ?? null) as number | null
  const showLocations = canManageLocations(ctx.planCode, locationsOverride)
  const maxLocations = locationsOverride ?? planData?.max_locations ?? 1

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

  // Load locations
  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('created_at', { ascending: true })

  // Uso de almacenamiento del tenant
  const { data: storageUsedBytes } = await supabase.rpc('clinic_storage_bytes')
  const maxStorageMb = planData?.max_storage_mb || 1024

  // Catálogo de laboratorio (categorías + todos los exámenes, activos e inactivos)
  const { data: labCategories } = await supabase
    .from('lab_test_categories')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
  const { data: labTests } = await supabase
    .from('lab_tests')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })

  // Catálogo de estudios habilitado por defecto: sembrar si la clínica aún no lo tiene (idempotente).
  await ensureStudyCatalogSeeded(supabase, ctx.clinicId)

  // Catálogo de estudios (secciones + todos los estudios, activos e inactivos)
  const { data: studySections } = await supabase
    .from('study_sections')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })
  const { data: studyItems } = await supabase
    .from('study_catalog')
    .select('*')
    .eq('clinic_id', ctx.clinicId)
    .order('sort_order', { ascending: true })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Settings size={24} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Configuración de Organización</h2>
      </div>

      <ConfigClient 
        clinic={clinic}
        teamMembers={teamMembers || []}
        invitations={invitations || []}
        locations={locations || []}
        currentUserId={ctx.user.id}
        maxDoctors={maxDoctors}
        maxAssistants={maxAssistants}
        planCode={ctx.planCode}
        canManageLocations={showLocations}
        canInviteDoctors={doctorsEnabled}
        maxLocations={maxLocations}
        storageUsedBytes={storageUsedBytes || 0}
        maxStorageMb={maxStorageMb}
        labCategories={labCategories || []}
        labTests={labTests || []}
        studySections={studySections || []}
        studyItems={studyItems || []}
      />
    </div>
  )
}

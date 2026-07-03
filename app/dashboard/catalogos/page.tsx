import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { requireOrgAdmin } from '@/utils/auth-guard'
import { ensureStudyCatalogSeeded } from '@/utils/ensureStudyCatalog'
import { BookOpen } from 'lucide-react'
import LabCatalogCard from '../config/LabCatalogCard'
import StudyCatalogCard from '../config/StudyCatalogCard'

/**
 * Sección "Catálogos": mantenimiento de los catálogos de Laboratorio y de Estudios
 * (radiología, cardiología, etc.). Solo el doctor administrador puede verlos y editarlos —
 * las server actions (app/dashboard/config/actions.ts) ya exigen requireOrgAdmin.
 * Antes vivían dentro de Configuración; se movieron aquí como sección propia.
 */
export default async function CatalogosPage() {
  const ctx = await requireOrgAdmin()

  if (!ctx) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo los administradores de la organización pueden gestionar los catálogos.</p>
      </div>
    )
  }

  const supabase = await createClient()

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <BookOpen size={24} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Catálogos</h2>
      </div>
      <p style={{ margin: '0 0 0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Exámenes de laboratorio y estudios que el médico puede marcar al generar órdenes y solicitudes.
      </p>

      <LabCatalogCard labCategories={labCategories || []} labTests={labTests || []} />
      <StudyCatalogCard studySections={studySections || []} studyItems={studyItems || []} />
    </div>
  )
}

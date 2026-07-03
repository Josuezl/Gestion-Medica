import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_STUDY_CATALOG } from '@/utils/studyCatalog'

/**
 * Siembra el catálogo de estudios por defecto (Cardiología + Radiología) para la clínica si aún
 * no tiene ninguna sección. Idempotente: no hace nada si ya existe catálogo (así respeta lo que el
 * admin haya personalizado o eliminado). Best-effort: cualquier error se traga y se registra, para
 * no romper la página que la invoca.
 *
 * Se usa el cliente de la sesión (no admin): las políticas RLS permiten a cualquier miembro de la
 * clínica insertar en su propio catálogo, así que basta con que un médico o admin abra la pantalla.
 *
 * Objetivo: que la "Solicitud de Estudios" funcione por defecto, sin que nadie tenga que pulsar
 * "Cargar catálogo estándar" en Configuración.
 */
export async function ensureStudyCatalogSeeded(supabase: SupabaseClient, clinicId: string): Promise<void> {
  if (!clinicId) return
  try {
    const { count } = await supabase
      .from('study_sections')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
    if ((count ?? 0) > 0) return // ya tiene catálogo (sembrado o personalizado)

    for (let s = 0; s < DEFAULT_STUDY_CATALOG.length; s++) {
      const sec = DEFAULT_STUDY_CATALOG[s]
      // Crear o recuperar la sección. A prueba de carreras: el índice único (clinic_id, name) impide
      // duplicados; si otra carga la creó primero, el insert no devuelve fila y la recuperamos.
      let sectionId: string | null = null
      const ins = await supabase
        .from('study_sections')
        .insert([{ clinic_id: clinicId, name: sec.section, sort_order: s }])
        .select('id')
        .maybeSingle()
      if (ins.data?.id) {
        sectionId = ins.data.id
      } else {
        const { data: existing } = await supabase
          .from('study_sections')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('name', sec.section)
          .maybeSingle()
        sectionId = existing?.id ?? null
      }
      if (!sectionId) continue

      // Insertar los estudios ignorando los que ya existan (índice único section_id, name).
      await supabase.from('study_catalog').upsert(
        sec.studies.map((st, i) => ({
          clinic_id: clinicId,
          section_id: sectionId,
          name: st.name,
          description: st.description || null,
          patient_indication: st.indication || null,
          sort_order: i,
        })),
        { onConflict: 'section_id,name', ignoreDuplicates: true }
      )
    }
  } catch (e) {
    console.error('No se pudo sembrar el catálogo de estudios por defecto para la clínica', clinicId, e)
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_LAB_CATALOG } from '@/utils/labCatalog'

/**
 * Siembra el catálogo estándar de laboratorio para la clínica si aún no tiene ninguna categoría.
 * Mismo criterio que ensureStudyCatalogSeeded: idempotente (si ya hay catálogo, sembrado o
 * personalizado, no hace nada) y best-effort (los errores se registran sin romper la página).
 *
 * Las clínicas creadas desde el superadmin ya nacen con catálogo; esto cubre las creadas por otra
 * vía (p. ej. la base local) para que la "Orden de Laboratorio" funcione sin pulsar "Cargar
 * catálogo estándar" en Configuración.
 */
export async function ensureLabCatalogSeeded(supabase: SupabaseClient, clinicId: string): Promise<void> {
  if (!clinicId) return
  try {
    const { count } = await supabase
      .from('lab_test_categories')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
    if ((count ?? 0) > 0) return // ya tiene catálogo (sembrado o personalizado)

    for (let c = 0; c < DEFAULT_LAB_CATALOG.length; c++) {
      const cat = DEFAULT_LAB_CATALOG[c]
      // A prueba de carreras: el índice único (clinic_id, name) impide duplicados; si otra carga
      // creó la categoría primero, el insert no devuelve fila y la recuperamos.
      let categoryId: string | null = null
      const ins = await supabase
        .from('lab_test_categories')
        .insert([{ clinic_id: clinicId, name: cat.category, sort_order: c }])
        .select('id')
        .maybeSingle()
      if (ins.data?.id) {
        categoryId = ins.data.id
      } else {
        const { data: existing } = await supabase
          .from('lab_test_categories')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('name', cat.category)
          .maybeSingle()
        categoryId = existing?.id ?? null
      }
      if (!categoryId) continue

      // Insertar los exámenes ignorando los que ya existan (índice único category_id, name).
      await supabase.from('lab_tests').upsert(
        cat.tests.map((name, i) => ({ clinic_id: clinicId, category_id: categoryId, name, sort_order: i })),
        { onConflict: 'category_id,name', ignoreDuplicates: true }
      )
    }
  } catch (e) {
    console.error('No se pudo sembrar el catálogo de laboratorio por defecto para la clínica', clinicId, e)
  }
}

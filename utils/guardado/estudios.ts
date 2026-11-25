// Solicitud de estudios de una consulta (médica o dental). Movida sin cambios de comportamiento
// desde utils/guardado/consulta.ts para que la consulta dental la reutilice.

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateVerificationCode } from '@/utils/verification-code'

interface CatalogStudyItem { section: string; name: string; description?: string | null; indication?: string | null }

/**
 * Agrega al catálogo de estudios de la clínica los estudios que el médico ingresó manualmente y
 * marcó para "guardar para la próxima vez". Crea la sección si no existe y evita duplicados por
 * nombre dentro de la sección. Catálogo compartido por toda la clínica (RLS por clinic_id).
 */
async function saveStudiesToCatalog(supabase: SupabaseClient, clinicId: string, items: CatalogStudyItem[]) {
  const bySection = new Map<string, CatalogStudyItem[]>()
  for (const it of items) {
    const sec = (it.section || 'Otros').trim() || 'Otros'
    if (!bySection.has(sec)) bySection.set(sec, [])
    bySection.get(sec)!.push(it)
  }
  for (const [sectionName, group] of bySection) {
    // Buscar o crear la sección.
    let sectionId: string | null = null
    const { data: existing } = await supabase
      .from('study_sections')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('name', sectionName)
      .maybeSingle()
    if (existing) {
      sectionId = existing.id
    } else {
      const { data: last } = await supabase
        .from('study_sections')
        .select('sort_order')
        .eq('clinic_id', clinicId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const sort = ((last?.sort_order ?? -1) as number) + 1
      const { data: created } = await supabase
        .from('study_sections')
        .insert([{ clinic_id: clinicId, name: sectionName, sort_order: sort }])
        .select('id')
        .single()
      sectionId = created?.id ?? null
    }
    if (!sectionId) continue

    const { data: lastStudy } = await supabase
      .from('study_catalog')
      .select('sort_order')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    let sort = ((lastStudy?.sort_order ?? -1) as number) + 1

    for (const it of group) {
      const { data: dup } = await supabase
        .from('study_catalog')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('section_id', sectionId)
        .eq('name', it.name)
        .maybeSingle()
      if (dup) continue
      await supabase.from('study_catalog').insert([{
        clinic_id: clinicId,
        section_id: sectionId,
        name: it.name,
        description: it.description || null,
        patient_indication: it.indication || null,
        sort_order: sort++,
      }])
    }
  }
}

/**
 * Inserta la solicitud de estudios del campo `study_request` (JSON) si el médico marcó alguno.
 * Los fallos no deshacen la consulta: se devuelven como avisos.
 */
export async function registrarSolicitudEstudios(
  supabase: SupabaseClient,
  { clinicId, patientId, consultationId, doctorId, formData }: {
    clinicId: string; patientId: string; consultationId: string; doctorId: string; formData: FormData
  },
): Promise<{ studyRequestId: string | null; warnings: string[] }> {
  const warnings: string[] = []
  let studyRequestId: string | null = null
  try {
    const raw = formData.get('study_request')
    if (typeof raw === 'string' && raw) {
      const parsed = JSON.parse(raw) as {
        studies?: CatalogStudyItem[]
        otherStudies?: string
        manualToCatalog?: CatalogStudyItem[]
      }
      const studies = Array.isArray(parsed?.studies) ? parsed.studies : []
      const otherStudies = (parsed?.otherStudies || '').trim()
      if (studies.length > 0 || otherStudies) {
        const studyVerificationCode = generateVerificationCode('EST')
        const { data: studyReq, error: studyErr } = await supabase
          .from('study_requests')
          .insert([{
            clinic_id: clinicId,
            patient_id: patientId,
            consultation_id: consultationId,
            doctor_id: doctorId,
            studies,
            other_studies: otherStudies || null,
            verification_code: studyVerificationCode,
          }])
          .select('id')
          .single()
        if (studyErr) {
          console.error('Error al insertar solicitud de estudios:', studyErr)
          warnings.push('La consulta se guardó, pero la solicitud de estudios no pudo registrarse.')
        } else {
          studyRequestId = studyReq.id
          // Estudios manuales marcados para guardar en el catálogo compartido de la clínica.
          const toCatalog = Array.isArray(parsed?.manualToCatalog) ? parsed.manualToCatalog : []
          if (toCatalog.length > 0) {
            try {
              await saveStudiesToCatalog(supabase, clinicId, toCatalog)
            } catch (e) {
              console.error('No se pudieron guardar los estudios manuales en el catálogo:', e)
              warnings.push('La solicitud se guardó, pero algún estudio manual no se agregó al catálogo.')
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Solicitud de estudios: study_request inválido', e)
    warnings.push('No se pudo procesar la solicitud de estudios (datos inválidos).')
  }

  return { studyRequestId, warnings }
}

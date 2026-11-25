import type { SupabaseClient } from '@supabase/supabase-js'
import { validarEstado, type Denticion } from '@/utils/odontograma'

export async function cargarOdontograma(supabase: SupabaseClient, consultationId: string, clinicId: string) {
  const { data, error } = await supabase.from('odontogramas').select('id, created_at, denticion, estado')
    .eq('consultation_id', consultationId).eq('clinic_id', clinicId).maybeSingle()
  if (error) throw new Error('No se pudo cargar el odontograma de la consulta.')
  if (!data) return null
  const estado = validarEstado(data.estado)
  if (!estado.ok) throw new Error('El odontograma guardado de la consulta no es válido.')
  return { id: data.id as string, fecha: data.created_at as string | null, estado: estado.estado, denticion: data.denticion as Denticion }
}

export async function cargarEstadoAnterior(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  actual: NonNullable<Awaited<ReturnType<typeof cargarOdontograma>>>,
) {
  if (!actual.fecha) return null
  const { data, error } = await supabase.from('odontogramas').select('estado')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .or(`created_at.lt.${actual.fecha},and(created_at.eq.${actual.fecha},id.lt.${actual.id})`)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(1).maybeSingle()
  if (error) throw new Error('No se pudo cargar el odontograma anterior.')
  if (!data) return null
  const validado = validarEstado(data.estado)
  if (!validado.ok) throw new Error('El odontograma anterior no es válido.')
  return validado.estado
}

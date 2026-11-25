import type { SupabaseClient } from '@supabase/supabase-js'
import { validarEstado, type Denticion } from '@/utils/odontograma'

export async function cargarOdontograma(supabase: SupabaseClient, consultationId: string, clinicId: string) {
  const { data, error } = await supabase.from('odontogramas').select('denticion, estado')
    .eq('consultation_id', consultationId).eq('clinic_id', clinicId).maybeSingle()
  if (error) throw new Error('No se pudo cargar el odontograma de la consulta.')
  if (!data) return null
  const estado = validarEstado(data.estado)
  if (!estado.ok) throw new Error('El odontograma guardado de la consulta no es válido.')
  return { estado: estado.estado, denticion: data.denticion as Denticion }
}

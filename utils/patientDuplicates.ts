import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyNameDobDuplicate, type DuplicateMatch } from './validation'

/**
 * Busca un posible paciente duplicado en la clínica y lo clasifica:
 *  - `block: true`  => mismo nombre normalizado + misma fecha de nacimiento + mismo género
 *                      (duplicado casi seguro): se bloquea el registro, no se puede saltar.
 *  - `block: false` => coincidencia menos certera (mismo DNI, o mismo nombre+fecha con género
 *                      distinto): solo aviso, el usuario puede confirmar y guardar.
 * Devuelve el match (con id/nombre/fecha para el mensaje) o null.
 *
 * Extraída de app/dashboard/patients/actions.ts (sin cambios de comportamiento) para reutilizarla
 * al aprobar solicitudes del portal público, donde también se crean fichas de paciente.
 */
export async function findDuplicatePatient(
  supabase: SupabaseClient,
  clinicId: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  gender: string,
  idCard: string | null,
): Promise<DuplicateMatch | null> {
  // 1. Por nombre + fecha de nacimiento (clasifica bloqueo vs aviso según el género).
  if (birthDate) {
    const { data: sameDob } = await supabase
      .from('patients')
      .select('id, first_name, last_name, birth_date, gender')
      .eq('clinic_id', clinicId)
      .eq('birth_date', birthDate)
    const match = classifyNameDobDuplicate(sameDob || [], firstName, lastName, gender)
    if (match) return match
  }

  // 2. Por DNI exacto (aviso): solo si no hubo coincidencia por nombre+fecha.
  if (idCard) {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name, birth_date')
      .eq('clinic_id', clinicId)
      .eq('id_card', idCard)
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        id: data.id,
        name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.replace(/\s+/g, ' ').trim(),
        birthDate: data.birth_date,
        block: false,
      }
    }
  }

  return null
}

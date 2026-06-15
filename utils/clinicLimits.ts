/**
 * Límites efectivos de una clínica = override por-clínica si existe, si no el valor del plan.
 * Fuente única para no desincronizar la UI, los server actions y el trigger SQL
 * (que aplica la misma regla con coalesce).
 */
export function effectiveLimit(
  override: number | null | undefined,
  planValue: number | null | undefined,
): number | null {
  if (override != null) return override
  return planValue ?? null
}

/**
 * ¿El tenant puede invitar médicos (no solo asistentes)?
 * Regla por tope efectivo: SOLO_MEDICO trae 1 (solo el dueño); HOSPITAL trae >1; un
 * SOLO_MEDICO con override ≥ 2 también queda habilitado.
 */
export function canInviteDoctors(effectiveMaxDoctors: number | null | undefined): boolean {
  return (effectiveMaxDoctors ?? 1) > 1
}

/**
 * ¿Se muestra la gestión de clínicas (locations)?
 * Asimetría intencional respecto a médicos: el plan HOSPITAL trae max_locations=10, pero
 * no queremos exponer la sección a todos los hospitales — solo a quienes el superadmin
 * habilite poniendo el override. SOLO_MEDICO la tiene por plan.
 */
export function canManageLocations(
  planCode: string | null | undefined,
  maxLocationsOverride: number | null | undefined,
): boolean {
  return planCode === 'SOLO_MEDICO' || maxLocationsOverride != null
}

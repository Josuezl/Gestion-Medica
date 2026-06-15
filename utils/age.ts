/**
 * Edad en años cumplidos a partir de la fecha de nacimiento (YYYY-MM-DD).
 * Fuente única para no duplicar el cálculo por toda la app.
 */
export function calculateAge(birthDate?: string | null): number {
  if (!birthDate) return 0
  const today = new Date()
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) return 0
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

/**
 * Regla del sistema: un paciente es pediátrico si es **menor de 19 años**.
 * Se deriva siempre de la fecha de nacimiento (sin marcado manual); el trigger
 * `set_is_pediatric` aplica la misma regla en la base de datos.
 */
export function isPediatric(birthDate?: string | null): boolean {
  const age = calculateAge(birthDate)
  return age >= 0 && age < 19
}

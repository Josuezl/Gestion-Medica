/**
 * Formateo unificado de nombres de doctores en todo el sistema.
 * Se muestra solo el primer nombre y el primer apellido para ahorrar espacio
 * (p.ej. "Manuel Armando Espinoza Rueda" -> "Dr. Manuel Espinoza").
 */

/** Primera palabra de una cadena (primer nombre o primer apellido). */
export function firstWord(value?: string | null): string {
  return (value ?? '').trim().split(/\s+/)[0] ?? ''
}

/** "{primer nombre} {primer apellido}" sin prefijo. */
export function personShortName(firstName?: string | null, lastName?: string | null): string {
  return [firstWord(firstName), firstWord(lastName)].filter(Boolean).join(' ')
}

/**
 * "Dr. {primer nombre} {primer apellido}".
 * Si no hay nombre disponible, devuelve "Médico".
 */
export function doctorShortName(firstName?: string | null, lastName?: string | null): string {
  const name = personShortName(firstName, lastName)
  return name ? `Dr. ${name}` : 'Médico'
}

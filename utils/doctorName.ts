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

/** Título según el género del médico: "Dra." si es femenino, "Dr." en cualquier otro caso. */
export function doctorTitle(gender?: string | null): string {
  return gender === 'F' ? 'Dra.' : 'Dr.'
}

/**
 * "Dr./Dra. {primer nombre} {primer apellido}" según el género del médico.
 * Si no hay nombre disponible, devuelve "Médico". Sin género → "Dr." (default).
 */
export function doctorShortName(firstName?: string | null, lastName?: string | null, gender?: string | null): string {
  const name = personShortName(firstName, lastName)
  return name ? `${doctorTitle(gender)} ${name}` : 'Médico'
}

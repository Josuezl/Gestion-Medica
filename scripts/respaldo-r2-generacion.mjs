// Decide con qué «generación» de BACKUP_PASSPHRASE se guardan los archivos de Storage en R2.
// Lógica pura (sin red ni disco) para poder probarla: la usa scripts/respaldo-r2-archivos.mjs.
//
// En R2, fuera de las carpetas con bucket lock:
//   estado/generacion.txt          → nombre de la generación vigente (p. ej. «k2»)
//   estado/testigo-<gen>.enc       → TEXTO_TESTIGO cifrado con la frase de esa generación
// Si el testigo ya no abre con la frase del secreto, alguien la rotó: se crea una generación nueva
// y el script vuelve a subir todos los archivos con la frase nueva. Rotar = solo cambiar el secreto.

/** Generación de los archivos subidos antes de automatizar (frase rotada el 2026-10-24). */
export const GENERACION_INICIAL = 'k2'

/** Contenido conocido del testigo: si descifra a esto, la frase no cambió. */
export const TEXTO_TESTIGO = 'gestion-medica-respaldos:testigo-de-frase'

/** Nombre de una generación nueva a partir de la fecha (UTC), p. ej. «k202610250715». */
export function nombreGeneracion(ahora) {
  return `k${ahora.toISOString().slice(0, 16).replace(/[-T:]/g, '')}`
}

/**
 * @param {{ puntero: string | null, testigo: 'abre' | 'no-abre' | 'falta' | null, ahora: Date }} estado
 *   puntero: contenido de estado/generacion.txt, o null si no existe.
 *   testigo: resultado de descifrar estado/testigo-<puntero>.enc con la frase actual
 *            (null cuando no hay puntero).
 * @returns {{ generacion: string, nueva: boolean, motivo: 'inicio' | 'igual' | 'rotacion' }}
 *   nueva: hay que escribir testigo y puntero antes de subir archivos.
 */
export function decidirGeneracion({ puntero, testigo, ahora }) {
  if (!puntero) return { generacion: GENERACION_INICIAL, nueva: true, motivo: 'inicio' }
  if (testigo === 'abre') return { generacion: puntero, nueva: false, motivo: 'igual' }
  if (testigo === 'no-abre') return { generacion: nombreGeneracion(ahora), nueva: true, motivo: 'rotacion' }
  // El testigo se escribe antes que el puntero, así que un puntero sin testigo no debería existir.
  // No se adivina: subir todo de nuevo por un estado raro gastaría egress sin motivo.
  throw new Error(`Estado inconsistente en R2: existe estado/generacion.txt (${puntero}) pero no su testigo. Revisar a mano.`)
}

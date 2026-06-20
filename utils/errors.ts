/**
 * Registra el error técnico en el servidor y devuelve un mensaje GENÉRICO y seguro para el
 * cliente. Evita filtrar detalles internos de la BD (nombres de columnas/constraints, etc.) que
 * ayudarían al reconocimiento de un atacante (hallazgo M3).
 *
 * Devuelve un `string` (no el objeto) para no alterar el tipo de retorno inferido de las server
 * actions: se usa como `return { error: safeErrorMessage('No se pudo ...', 'ctx', error) }`.
 */
export function safeErrorMessage(userMessage: string, context: string, error: unknown): string {
  console.error(`[${context}]`, error)
  return userMessage
}

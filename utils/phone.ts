/**
 * Normaliza el teléfono SIN guiones/espacios. Acepta números internacionales:
 * con '+' se respeta el código de país; un número local de 8 dígitos asume Honduras (+504).
 * Extraída de app/dashboard/patients/actions.ts para reutilizarla en el portal público.
 */
export function sanitizePhone(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '') // solo dígitos
  if (!digits) return null
  if (hasPlus) return `+${digits}`               // internacional: respeta su código de país
  if (digits.length === 8) return `+504${digits}` // Honduras local (compat anterior)
  return digits                                   // otro formato: se guarda solo con dígitos
}

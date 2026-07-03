import { randomBytes } from 'crypto'

/**
 * Genera un código de verificación con un CSPRNG (NO Math.random, que es predecible).
 *
 * Estos códigos son la única barrera de acceso de las páginas públicas de verificación
 * (/verificar/[code], /prescriptions/view/[id]) que muestran datos clínicos, por lo que
 * deben ser impredecibles. Formato: `PREFIX-XXXXXXXXXX` (10 chars base36 en mayúsculas,
 * derivados de 8 bytes aleatorios ≈ 51 bits de entropía).
 */
export function generateVerificationCode(prefix: string): string {
  const code = BigInt('0x' + randomBytes(8).toString('hex'))
    .toString(36)
    .toUpperCase()
    .padStart(13, '0')
    .slice(-10)
  return `${prefix}-${code}`
}

/**
 * Token para los links públicos de auto-agendamiento (/agendar/[token]). Es la única barrera
 * de acceso al portal de una clínica, así que necesita más entropía que los códigos de
 * verificación: 18 bytes aleatorios (144 bits) en base64url → 24 caracteres URL-safe.
 */
export function generateBookingToken(): string {
  return randomBytes(18).toString('base64url')
}

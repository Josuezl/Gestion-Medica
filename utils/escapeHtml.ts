/**
 * Escapa texto antes de interpolarlo en HTML armado a mano (correos, impresión del expediente).
 * Sin esto, un nombre o nota con `<img onerror=…>` se ejecutaría en vez de mostrarse.
 * En JSX no hace falta: React ya escapa.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

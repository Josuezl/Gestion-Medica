/**
 * Versión de la app (commit de Vercel) para detectar pestañas abiertas desde antes de un
 * despliegue. El build la graba en el bundle (NEXT_PUBLIC_APP_VERSION) y en public/version.json.
 * Solo sintaxis "borrable" de TypeScript: scripts/write-version.mjs la importa directo.
 */

export const SIN_VERSION = 'sin-version'

/** Contenido de public/version.json para un commit; vacío o ausente → `sin-version`. */
export function versionFileContent(sha: string | undefined): string {
  return JSON.stringify({ version: sha || SIN_VERSION })
}

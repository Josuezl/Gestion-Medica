import { execFileSync } from 'node:child_process'

/** Lee `supabase status -o env` (líneas `CLAVE="valor"`); vacío si Supabase no corre. */
export function statusSupabaseLocal(): Record<string, string> {
  let texto = ''
  try {
    texto = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    // Supabase detenido: el candado lo rechaza.
  }
  const status: Record<string, string> = {}
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m) status[m[1]] = m[2]
  }
  return status
}

export const PASSWORD_E2E = 'E2e-Prueba-2026!'
export const USUARIOS_E2E = {
  medico: 'medico@e2e.test',
  asistente: 'asistente@e2e.test',
  admin: 'admin@e2e.test',
} as const
export type RolE2e = keyof typeof USUARIOS_E2E
export const archivoSesion = (rol: RolE2e) => `e2e/.auth/${rol}.json`
export const TOKEN_AGENDAR = 'e2e-agendar'

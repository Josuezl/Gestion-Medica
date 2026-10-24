/**
 * Arranca Next.js contra la Supabase LOCAL (Docker), no contra la nube.
 *
 * Lee las claves de `supabase status -o env` y se las pasa a `next dev` por el entorno del
 * proceso: Next no pisa variables que ya existen en process.env, así que ganan sobre
 * `.env.local`. Correo, WhatsApp e IA quedan apagados (claves vacías).
 *
 * Uso:
 *   npm run db:local   # una vez: levanta Supabase en Docker
 *   npm run dev        # este script
 *   npm run dev:nube   # el modo anterior (base REAL); solo a propósito
 */
import { execFileSync, spawn } from 'node:child_process'
import { variablesDevLocal } from '../utils/entornoLocal.ts'

/** Convierte las líneas `CLAVE="valor"` de `supabase status -o env` en un objeto. */
function parsearStatus(texto) {
  const status = {}
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m) status[m[1]] = m[2]
  }
  return status
}

let salida = ''
try {
  salida = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  // Supabase detenido: variablesDevLocal({}) lanza el mensaje con la instrucción.
}

let variables
try {
  variables = variablesDevLocal(parsearStatus(salida))
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}

console.log('Usando Supabase LOCAL (127.0.0.1:54321). Correos y WhatsApp desactivados.')

const next = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ...variables },
})
next.on('exit', (code) => process.exit(code ?? 0))

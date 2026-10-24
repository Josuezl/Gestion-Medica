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
 *   node scripts/dev-local.mjs --start --port 3100   # build de producción contra la base local
 *   node scripts/dev-local.mjs --build --start ...   # construye antes (las NEXT_PUBLIC_* se fijan en el build)
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { PUERTO_DEV, variablesDevLocal } from '../utils/entornoLocal.ts'

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

// `--start`: `next start` sobre el build ya hecho, con las mismas variables locales
// (.env.production.local trae la URL de la nube).
const args = process.argv.slice(2)
const modo = args.includes('--start') ? 'start' : 'dev'
const construir = args.includes('--build')
const resto = args.filter((a) => a !== '--start' && a !== '--build')

// Puerto propio salvo que se pase otro (`npm run dev -- --port 3100`).
if (!resto.some((a) => a === '--port' || a === '-p' || a.startsWith('--port='))) {
  resto.push('--port', String(PUERTO_DEV))
}

const env = { ...process.env, ...variables }

if (construir) {
  for (const cmd of [['node', 'scripts/write-version.mjs'], ['npx', 'next', 'build']]) {
    const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', env })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}

const next = spawn('npx', ['next', modo, ...resto], {
  stdio: 'inherit',
  env,
})
next.on('exit', (code) => process.exit(code ?? 0))

#!/usr/bin/env node
// Copia incremental de Supabase Storage a R2 (corre en el workflow DB Backup, job respaldo-r2).
//
// Solo AGREGA: cada archivo se sube cifrado una vez con la clave
//   archivos/<generación>/<bucket>/<ruta>@<updated_at en ms>.enc
// Si un archivo se reemplaza en Storage cambia su updated_at y se sube como una clave nueva, así
// nada se sobrescribe ni se borra (el bucket lock de R2 lo impediría igual). Para restaurar, por
// cada <bucket>/<ruta> se toma la versión con el número más alto.
//
// La generación sale de estado/generacion.txt y cambia sola cuando se rota BACKUP_PASSPHRASE
// (scripts/respaldo-r2-generacion.mjs): rotar es solo actualizar el secreto en GitHub.
//
// Egress: solo se descargan de Supabase los archivos que faltan en R2 (plan Free: 5 GB/mes).
// Privacidad: el log muestra solo conteos, nunca rutas (pueden identificar pacientes).
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_PASSPHRASE, R2_ENDPOINT, R2_BUCKET y las
// credenciales de R2 en AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (las lee el aws CLI).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decidirGeneracion, TEXTO_TESTIGO } from './respaldo-r2-generacion.mjs'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY, R2_ENDPOINT, R2_BUCKET } = process.env
for (const n of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_PASSPHRASE', 'R2_ENDPOINT', 'R2_BUCKET']) {
  if (!process.env[n]) throw new Error(`Falta ${n}`)
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

// Frenos por corrida: una noche normal sube unos pocos archivos. Si un bug hiciera creer que faltan
// todos, se detiene en vez de gastar egress de Supabase (plan Free) y operaciones de R2 (con tarjeta).
const MAX_ARCHIVOS = 500
const MAX_BYTES = 300e6

async function api(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`Storage ${path.split('/')[0]}: ${res.status}`)
  return res
}

/** Todos los objetos de un bucket (la API lista por carpeta: se recorre recursivamente). */
async function listar(bucket, prefijo = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const items = await (await api(`object/list/${bucket}`, {
      method: 'POST',
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }),
    })).json()
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name
      if (it.id === null) out.push(...await listar(bucket, ruta)) // carpeta
      else out.push({ ruta, version: new Date(it.updated_at ?? it.created_at).getTime() })
    }
    if (items.length < 1000) return out
  }
}

function aws(args) {
  return execFileSync('aws', [...args, '--endpoint-url', R2_ENDPOINT], { encoding: 'utf8' })
}

const OPENSSL = ['-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-pass', 'env:BACKUP_PASSPHRASE']
const cifrar = (entrada, salida) => execFileSync('openssl', ['enc', ...OPENSSL, '-salt', '-in', entrada, '-out', salida])

/** Baja un objeto de R2: true si existe, false si no existe (404). Otro error (red) → excepción. */
function bajar(clave, destino) {
  const r = spawnSync('aws', ['s3', 'cp', `s3://${R2_BUCKET}/${clave}`, destino, '--only-show-errors', '--endpoint-url', R2_ENDPOINT], { encoding: 'utf8' })
  if (r.status === 0) return true
  if (/\(404\)|does not exist|NoSuchKey/i.test(r.stderr)) return false
  // No se asume rotación por un fallo pasajero: subir todo de nuevo gastaría egress sin motivo.
  throw new Error(`No se pudo leer ${clave} de R2: ${r.stderr.trim().split('\n').pop()}`)
}

const tmp = mkdtempSync(join(tmpdir(), 'archivos-'))
let total = 0, subidos = 0, bytes = 0
try {
  // ¿Con qué generación de la frase se guardan los archivos? (ver respaldo-r2-generacion.mjs)
  const archPuntero = join(tmp, 'puntero'), archTestigo = join(tmp, 'testigo')
  const puntero = bajar('estado/generacion.txt', archPuntero) ? readFileSync(archPuntero, 'utf8').trim() : null
  let testigo = null
  if (puntero) {
    if (!bajar(`estado/testigo-${puntero}.enc`, archTestigo)) testigo = 'falta'
    else {
      const r = spawnSync('openssl', ['enc', '-d', ...OPENSSL, '-in', archTestigo], { encoding: 'utf8' })
      testigo = r.status === 0 && r.stdout === TEXTO_TESTIGO ? 'abre' : 'no-abre'
    }
  }
  const { generacion, nueva, motivo } = decidirGeneracion({ puntero, testigo, ahora: new Date() })
  console.log(`Generación de la frase: ${generacion} (${motivo === 'igual' ? 'sin cambios' : motivo === 'inicio' ? 'primera corrida' : 'ROTACIÓN DETECTADA: se suben todos los archivos con la frase nueva'})`)
  if (nueva) {
    // Primero el testigo y después el puntero: si la corrida se corta, la siguiente sigue donde quedó.
    const plano = join(tmp, 'testigo-plano')
    writeFileSync(plano, TEXTO_TESTIGO)
    cifrar(plano, archTestigo)
    aws(['s3', 'cp', archTestigo, `s3://${R2_BUCKET}/estado/testigo-${generacion}.enc`, '--only-show-errors'])
    writeFileSync(archPuntero, generacion)
    aws(['s3', 'cp', archPuntero, `s3://${R2_BUCKET}/estado/generacion.txt`, '--only-show-errors'])
  }

  const enR2 = new Set(JSON.parse(aws([
    's3api', 'list-objects-v2', '--bucket', R2_BUCKET, '--prefix', `archivos/${generacion}/`,
    '--query', 'Contents[].Key', '--output', 'json',
  ]) || 'null') ?? [])

  const buckets = await (await api('bucket')).json()
  for (const { id: bucket } of buckets) {
    for (const { ruta, version } of await listar(bucket)) {
      total++
      const clave = `archivos/${generacion}/${bucket}/${ruta}@${version}.enc`
      if (enR2.has(clave)) continue
      if (subidos >= MAX_ARCHIVOS || bytes >= MAX_BYTES) {
        throw new Error(`Freno: ya se subieron ${subidos} archivos (${(bytes / 1e6).toFixed(1)} MB) en esta corrida. Revisar antes de seguir.`)
      }
      const plano = join(tmp, 'plano'), cifrado = join(tmp, 'cifrado')
      const datos = Buffer.from(await (await api(`object/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer())
      writeFileSync(plano, datos)
      cifrar(plano, cifrado)
      aws(['s3', 'cp', cifrado, `s3://${R2_BUCKET}/${clave}`, '--only-show-errors'])
      subidos++
      bytes += datos.length
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`Storage: ${total} archivos; ${subidos} nuevos subidos a R2 (${(bytes / 1e6).toFixed(1)} MB descargados de Supabase).`)

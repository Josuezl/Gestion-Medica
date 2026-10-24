#!/usr/bin/env node
// Copia incremental de Supabase Storage a R2 (corre en el workflow DB Backup, job respaldo-r2).
//
// Solo AGREGA: cada archivo se sube cifrado una vez con la clave
//   archivos/<bucket>/<ruta>@<updated_at en ms>.enc
// Si un archivo se reemplaza en Storage cambia su updated_at y se sube como una clave nueva, así
// nada se sobrescribe ni se borra (el bucket lock de R2 lo impediría igual). Para restaurar, por
// cada <bucket>/<ruta> se toma la versión con el número más alto.
//
// Egress: solo se descargan de Supabase los archivos que faltan en R2 (plan Free: 5 GB/mes).
// Privacidad: el log muestra solo conteos, nunca rutas (pueden identificar pacientes).
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_PASSPHRASE, R2_ENDPOINT, R2_BUCKET y las
// credenciales de R2 en AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (las lee el aws CLI).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const enR2 = new Set(JSON.parse(aws([
  's3api', 'list-objects-v2', '--bucket', R2_BUCKET, '--prefix', 'archivos/',
  '--query', 'Contents[].Key', '--output', 'json',
]) || 'null') ?? [])

const tmp = mkdtempSync(join(tmpdir(), 'archivos-'))
let total = 0, subidos = 0, bytes = 0
try {
  const buckets = await (await api('bucket')).json()
  for (const { id: bucket } of buckets) {
    for (const { ruta, version } of await listar(bucket)) {
      total++
      const clave = `archivos/${bucket}/${ruta}@${version}.enc`
      if (enR2.has(clave)) continue
      if (subidos >= MAX_ARCHIVOS || bytes >= MAX_BYTES) {
        throw new Error(`Freno: ya se subieron ${subidos} archivos (${(bytes / 1e6).toFixed(1)} MB) en esta corrida. Revisar antes de seguir.`)
      }
      const plano = join(tmp, 'plano'), cifrado = join(tmp, 'cifrado')
      const datos = Buffer.from(await (await api(`object/${bucket}/${ruta.split('/').map(encodeURIComponent).join('/')}`)).arrayBuffer())
      writeFileSync(plano, datos)
      execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt',
        '-in', plano, '-out', cifrado, '-pass', 'env:BACKUP_PASSPHRASE'])
      aws(['s3', 'cp', cifrado, `s3://${R2_BUCKET}/${clave}`, '--only-show-errors'])
      subidos++
      bytes += datos.length
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`Storage: ${total} archivos; ${subidos} nuevos subidos a R2 (${(bytes / 1e6).toFixed(1)} MB descargados de Supabase).`)

/**
 * Backup casero de Supabase (plan Free sin backups automáticos — spec
 * docs/superpowers/specs/2026-07-11-backup-casero-supabase-design.md).
 *
 * Exporta TODAS las tablas expuestas por PostgREST a JSON usando la service-role key.
 * Descubre las tablas dinámicamente del OpenAPI (las tablas nuevas entran solas) y pagina
 * de a 1000 filas (límite de PostgREST) ordenando por id/created_at cuando existe.
 * SOLO LECTURA: seguro de correr contra producción.
 *
 * Uso local:  node --env-file=.env.local scripts/backup-export.mjs
 * En CI:      SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY como secrets (ver db-backup.yml)
 *
 * Salida: backup-out/<tabla>.json + backup-out/manifest.json
 * ⚠️ El directorio de salida contiene datos clínicos SIN cifrar: está en .gitignore y en CI
 *    se cifra con openssl antes de subir el artifact (el repo es público).
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { pickOrderColumn } from './backup-lib.mjs'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OUT_DIR = process.env.BACKUP_OUT_DIR || 'backup-out'
const PAGE = 1000

if (!URL || !KEY) {
  console.error('Faltan variables: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

/** Tablas expuestas según el OpenAPI de PostgREST (con service-role ve todas). */
async function discoverTables() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`OpenAPI respondió ${res.status}`)
  const spec = await res.json()
  const tables = {}
  for (const [path, ops] of Object.entries(spec.paths || {})) {
    const name = path.replace(/^\//, '')
    // Solo tablas/vistas reales (el root "/" y los RPC "/rpc/..." no son tablas).
    if (!name || name.startsWith('rpc/')) continue
    if (!ops.get) continue
    tables[name] = spec.definitions?.[name]?.properties ?? null
  }
  return tables
}

async function exportTable(supabase, table, properties) {
  const orderCol = pickOrderColumn(properties)
  const rows = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (orderCol) query = query.order(orderCol, { ascending: true })
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

const supabase = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

console.log(`Backup de ${URL} → ${OUT_DIR}/`)
const tables = await discoverTables()
const names = Object.keys(tables).sort()
console.log(`Tablas descubiertas (${names.length}): ${names.join(', ')}`)

await mkdir(OUT_DIR, { recursive: true })
const manifest = { generatedAt: new Date().toISOString(), source: URL, tables: {} }

for (const name of names) {
  const rows = await exportTable(supabase, name, tables[name])
  await writeFile(`${OUT_DIR}/${name}.json`, JSON.stringify(rows))
  manifest.tables[name] = rows.length
  console.log(`  ${name}: ${rows.length} filas`)
}

await writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2))
const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0)
console.log(`Listo: ${names.length} tablas, ${total} filas en total.`)

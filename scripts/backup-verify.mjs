/**
 * Verificación del backup casero: re-lee el directorio exportado por backup-export.mjs y
 * confirma que cada JSON parsea, que los conteos coinciden con el manifest y que las tablas
 * núcleo no están vacías (lógica pura en backup-lib.mjs, testeada con vitest).
 * Sale con código 1 si algo falla → el GitHub Action falla → correo al dueño del repo.
 *
 * Uso: node scripts/backup-verify.mjs [directorio]   (default: backup-out)
 */
import { readFile, readdir } from 'node:fs/promises'
import { verifyBackupCounts } from './backup-lib.mjs'

const DIR = process.argv[2] || process.env.BACKUP_OUT_DIR || 'backup-out'

let manifest
try {
  manifest = JSON.parse(await readFile(`${DIR}/manifest.json`, 'utf8'))
} catch (e) {
  console.error(`No se pudo leer ${DIR}/manifest.json: ${e.message}`)
  process.exit(1)
}

const actualCounts = {}
for (const file of await readdir(DIR)) {
  if (!file.endsWith('.json') || file === 'manifest.json') continue
  const table = file.slice(0, -'.json'.length)
  try {
    const rows = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'))
    if (!Array.isArray(rows)) throw new Error('el contenido no es un array')
    actualCounts[table] = rows.length
  } catch (e) {
    console.error(`FALLO ${table}: JSON ilegible (${e.message})`)
    process.exit(1)
  }
}

const problems = verifyBackupCounts(manifest, actualCounts)
if (problems.length > 0) {
  console.error('BACKUP INVÁLIDO:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0)
console.log(`Backup verificado: ${Object.keys(manifest.tables).length} tablas, ${total} filas, generado ${manifest.generatedAt}.`)

/**
 * Lógica pura del backup casero de Supabase (sin I/O): elegible de columna de orden para
 * paginación estable y verificación del backup contra su manifest. Se testea con vitest
 * (tests/backupLib.test.ts). El I/O vive en backup-export.mjs / backup-verify.mjs.
 */

/** Tablas que NUNCA pueden faltar ni estar vacías en un backup sano de producción. */
export const CORE_TABLES = ['clinics', 'user_profiles', 'patients', 'consultations', 'prescriptions', 'appointments']

/**
 * Elige la columna para ordenar la paginación (PostgREST pagina con range; sin orden estable
 * se pueden duplicar/perder filas entre páginas). `properties` viene del OpenAPI de PostgREST.
 */
export function pickOrderColumn(properties) {
  if (!properties || typeof properties !== 'object') return null
  if ('id' in properties) return 'id'
  if ('created_at' in properties) return 'created_at'
  return null
}

/**
 * Compara el manifest contra los conteos reales releídos de los archivos del backup.
 * Devuelve la lista de problemas (vacía = backup sano).
 *
 * Reglas:
 * - toda tabla del manifest debe tener archivo, y su conteo debe coincidir;
 * - toda tabla núcleo debe estar en el manifest y con al menos 1 fila.
 */
export function verifyBackupCounts(manifest, actualCounts) {
  const problems = []
  const tables = manifest?.tables && typeof manifest.tables === 'object' ? manifest.tables : null
  if (!tables) return ['manifest inválido: falta el objeto tables']

  for (const [table, expected] of Object.entries(tables)) {
    const actual = actualCounts[table]
    if (actual === undefined) {
      problems.push(`falta el archivo de la tabla "${table}" (manifest esperaba ${expected} filas)`)
    } else if (actual !== expected) {
      problems.push(`la tabla "${table}" tiene ${actual} filas pero el manifest esperaba ${expected}`)
    }
  }

  for (const core of CORE_TABLES) {
    if (!(core in tables)) {
      problems.push(`la tabla núcleo "${core}" no está en el manifest`)
    } else if (tables[core] === 0) {
      problems.push(`la tabla núcleo "${core}" está vacía (0 filas): backup sospechoso`)
    }
  }

  return problems
}

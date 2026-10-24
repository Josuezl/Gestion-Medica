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

/** Cada cuánto una pestaña visible vuelve a consultar /version.json. */
export const INTERVALO_VERSION_MS = 5 * 60 * 1000

export type MotivoVerificacion = 'navegacion' | 'intervalo' | 'foco' | 'fallo_guardado'
export type AccionVersion = 'nada' | 'recargar' | 'avisar'

/**
 * Qué hacer al comparar la versión del bundle con la publicada.
 * Solo recarga al navegar (el usuario ya sale de la pantalla); en los demás casos avisa para
 * no perder un formulario a medias. Sin respuesta del servidor no hace nada.
 */
export function decidirAccionVersion(e: {
  local: string | undefined
  servidor: string | null
  motivo: MotivoVerificacion
  recargaReciente: boolean
}): AccionVersion {
  if (!e.local || e.servidor === null || e.local === e.servidor) return 'nada'
  if (e.motivo === 'navegacion' && !e.recargaReciente) return 'recargar'
  return 'avisar'
}

const CLAVE_RECARGA = 'gm_recarga_version'
const VENTANA_RECARGA_MS = 60_000

/** `true` si ya se recargó hacia esta versión hace menos de 60 s (CDN aún propagando). */
export function recargaReciente(version: string, ahora: number, almacen: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const raw = almacen?.getItem(CLAVE_RECARGA)
    if (!raw) return false
    const marca = JSON.parse(raw) as { version?: unknown; en?: unknown }
    return marca.version === version && typeof marca.en === 'number' && ahora - marca.en < VENTANA_RECARGA_MS
  } catch {
    return false
  }
}

/** Anota que se va a recargar hacia `version`; si el storage está bloqueado no pasa nada. */
export function marcarRecarga(version: string, ahora: number, almacen: Pick<Storage, 'setItem'> | null): void {
  try {
    almacen?.setItem(CLAVE_RECARGA, JSON.stringify({ version, en: ahora }))
  } catch {
    // Storage bloqueado (modo privado): solo se pierde la protección contra el bucle.
  }
}

// Red de formularios: lo escrito se copia antes de «Actualizar» y se devuelve tras recargar.

/** Clave = índice o `id` del formulario; valor = campo `name` → valor. */
export type CamposRespaldo = Record<string, Record<string, string>>

export const CLAVE_RESPALDO = 'gm_respaldo_formularios'
const VIGENCIA_RESPALDO_MS = 10 * 60 * 1000

export function empaquetarRespaldo(ruta: string, campos: CamposRespaldo, ahora: number): string {
  return JSON.stringify({ ruta, campos, en: ahora })
}

/** Campos respaldados para `ruta`; `null` si no hay, no parsea, es de otra ruta o tiene más de 10 min. */
export function leerRespaldo(raw: string | null, ruta: string, ahora: number): CamposRespaldo | null {
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as { ruta?: unknown; campos?: unknown; en?: unknown }
    if (r.ruta !== ruta || typeof r.en !== 'number' || ahora - r.en > VIGENCIA_RESPALDO_MS) return null
    if (!r.campos || typeof r.campos !== 'object') return null
    return r.campos as CamposRespaldo
  } catch {
    return null
  }
}

'use client'

/**
 * Compara la versión del bundle con /version.json (archivo estático del CDN: no gasta funciones
 * de Vercel ni toca Supabase) y ejecuta la decisión de `decidirAccionVersion`.
 */
import {
  decidirAccionVersion, marcarRecarga, recargaReciente,
  type AccionVersion, type MotivoVerificacion,
} from './appVersion'

export const EVENTO_VERSION_NUEVA = 'gm:version-nueva'

function sesion(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

// Sin límite, una consulta colgada (servidor reiniciando) dejaría `enCurso` pendiente para siempre.
const LIMITE_CONSULTA_MS = 10_000

async function versionPublicada(): Promise<string | null> {
  const control = new AbortController()
  const limite = setTimeout(() => control.abort(), LIMITE_CONSULTA_MS)
  try {
    const res = await fetch('/version.json', { cache: 'no-store', signal: control.signal })
    if (res.status !== 200) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    // Sin internet, despliegue en curso o sin respuesta a tiempo: no se hace nada.
    return null
  } finally {
    clearTimeout(limite)
  }
}

let enCurso: Promise<AccionVersion> | null = null

/** Verificaciones simultáneas reutilizan la promesa en curso. */
export function verificarVersion(motivo: MotivoVerificacion): Promise<AccionVersion> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    const servidor = await versionPublicada()
    const ahora = Date.now()
    const accion = decidirAccionVersion({
      local: process.env.NEXT_PUBLIC_APP_VERSION,
      servidor,
      motivo,
      recargaReciente: servidor !== null && recargaReciente(servidor, ahora, sesion()),
    })
    if (accion === 'recargar' && servidor !== null) {
      marcarRecarga(servidor, ahora, sesion())
      window.location.reload()
    } else if (accion === 'avisar') {
      window.dispatchEvent(new Event(EVENTO_VERSION_NUEVA))
    }
    return accion
  })().finally(() => {
    enCurso = null
  })
  return enCurso
}

/**
 * Borradores locales de formularios clínicos (localStorage). Módulo puro: el storage se inyecta
 * para poder testearlo y para degradar en silencio cuando localStorage no está disponible
 * (modo privado, cuota llena). Un borrador huérfano expira a las 24 h por privacidad en
 * máquinas compartidas de la clínica.
 */

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

const DRAFT_PREFIX = 'consultation-draft:v1:'

export interface DraftPayload {
  savedAt: number
  fields: Record<string, string>
}

export function draftKey(userId: string, patientId: string): string {
  return `${DRAFT_PREFIX}${userId}:${patientId}`
}

/** Convierte un FormData en un record plano de strings (los File se ignoran). */
export function formDataToFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {}
  formData.forEach((value, name) => {
    if (typeof value === 'string') fields[name] = value
  })
  return fields
}

function isDraftPayload(v: unknown): v is DraftPayload {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.savedAt === 'number' && typeof o.fields === 'object' && o.fields !== null
}

export function saveDraft(storage: Storage | null, key: string, fields: Record<string, string>, now: number = Date.now()): void {
  if (!storage) return
  try {
    const payload: DraftPayload = { savedAt: now, fields }
    storage.setItem(key, JSON.stringify(payload))
  } catch {
    // Cuota llena o storage bloqueado: el formulario sigue funcionando sin respaldo.
  }
}

export function loadDraft(storage: Storage | null, key: string, now: number = Date.now()): DraftPayload | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      storage.removeItem(key)
      return null
    }
    if (!isDraftPayload(parsed) || now - parsed.savedAt > DRAFT_TTL_MS) {
      storage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(storage: Storage | null, key: string): void {
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // sin storage no hay nada que limpiar
  }
}

/** Elimina todos los borradores expirados o corruptos con nuestro prefijo. Se corre al montar. */
export function purgeExpiredDrafts(storage: Storage | null, now: number = Date.now()): void {
  if (!storage) return
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith(DRAFT_PREFIX)) continue
      const raw = storage.getItem(key)
      let expired = true
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw)
          expired = !isDraftPayload(parsed) || now - parsed.savedAt > DRAFT_TTL_MS
        } catch {
          expired = true
        }
      }
      if (expired) toRemove.push(key)
    }
    for (const key of toRemove) storage.removeItem(key)
  } catch {
    // best-effort
  }
}

/** localStorage real con probe de escritura; null si no está disponible (SSR, modo privado). */
export function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    const s = window.localStorage
    const probe = '__formdraft_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDraft,
  getLocalStorage,
  loadDraft,
  purgeExpiredDrafts,
  saveDraft,
  type DraftPayload,
} from './formDraft'

const AUTOSAVE_DEBOUNCE_MS = 1500

/**
 * Autosave con debounce de un formulario a localStorage + restauración al montar.
 *
 * - Al montar purga borradores expirados y, si hay borrador vigente para `storageKey`,
 *   lo expone en `pendingDraft` para que la UI ofrezca Restaurar/Descartar.
 * - Mientras `pendingDraft` espera decisión NO se autoguarda (evita pisar el borrador
 *   existente con un formulario recién abierto y vacío).
 * - `clearSavedDraft` se llama tras un guardado exitoso en el servidor.
 */
export function useFormDraft(storageKey: string, getSnapshot: () => Record<string, string>) {
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null)
  const pendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef = useRef(getSnapshot)
  snapshotRef.current = getSnapshot

  useEffect(() => {
    const storage = getLocalStorage()
    purgeExpiredDrafts(storage)
    const draft = loadDraft(storage, storageKey)
    if (draft) {
      pendingRef.current = true
      setPendingDraft(draft)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [storageKey])

  const scheduleSave = useCallback(() => {
    if (pendingRef.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveDraft(getLocalStorage(), storageKey, snapshotRef.current())
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [storageKey])

  /** Cierra el banner de restauración sin borrar el borrador (p. ej. al restaurarlo). */
  const resolvePendingDraft = useCallback(() => {
    pendingRef.current = false
    setPendingDraft(null)
  }, [])

  /** Descarta el borrador guardado y cierra el banner. */
  const discardDraft = useCallback(() => {
    clearDraft(getLocalStorage(), storageKey)
    pendingRef.current = false
    setPendingDraft(null)
  }, [storageKey])

  /** Elimina el borrador tras un guardado exitoso (y cancela autosaves en vuelo). */
  const clearSavedDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    clearDraft(getLocalStorage(), storageKey)
  }, [storageKey])

  return { pendingDraft, scheduleSave, discardDraft, resolvePendingDraft, clearSavedDraft }
}

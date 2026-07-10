# Guardado Resiliente en Nueva Consulta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el formulario de Nueva Consulta nunca pierda el trabajo del médico: manejo explícito de fallos de red al guardar, borrador local con restauración, y aviso de conexión en vivo.

**Architecture:** Módulo puro `utils/formDraft.ts` (serialización, TTL 24h, purga — 100% testeable con storage inyectado) + hook cliente delgado `utils/useFormDraft.ts` (debounce, ciclo de vida) + componente `ConnectionBanner` + integración en `NewConsultationClient.tsx` (try/catch + timeout 30s en submit, banner de restauración). Sin cambios de base de datos.

**Tech Stack:** Next.js App Router (client component existente), TypeScript estricto, vitest, localStorage, puppeteer para E2E.

**Spec:** `docs/superpowers/specs/2026-07-10-consulta-borrador-resiliente-design.md`

## Global Constraints

- Nunca introducir `any` (usar `unknown` + narrowing); los `as` de JSON.parse siguen el patrón existente de `actions.ts`.
- Textos de UI en español; comentarios de código en español (estilo del codebase).
- Tests en `tests/*.test.ts`, imports con alias `@/`.
- Sin DDL / cambios de esquema.
- No correr `next build` con `next dev` vivo (desincroniza `.next`).
- Antes de cualquier push a main: `npm test` y `npm run build` en verde + E2E puppeteer.
- Clave de borrador: `consultation-draft:v1:{userId}:{patientId}`; TTL 24 h; borrar al guardar con éxito.

---

### Task 1: Módulo puro `utils/formDraft.ts` (TDD)

**Files:**
- Create: `utils/formDraft.ts`
- Test: `tests/formDraft.test.ts`

**Interfaces:**
- Consumes: nada (módulo hoja).
- Produces (usado por Task 2 y 4):
  - `DRAFT_TTL_MS: number`
  - `interface DraftPayload { savedAt: number; fields: Record<string, string> }`
  - `draftKey(userId: string, patientId: string): string`
  - `formDataToFields(formData: FormData): Record<string, string>`
  - `saveDraft(storage: Storage | null, key: string, fields: Record<string, string>, now?: number): void`
  - `loadDraft(storage: Storage | null, key: string, now?: number): DraftPayload | null`
  - `clearDraft(storage: Storage | null, key: string): void`
  - `purgeExpiredDrafts(storage: Storage | null, now?: number): void`
  - `getLocalStorage(): Storage | null`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/formDraft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  DRAFT_TTL_MS,
  draftKey,
  formDataToFields,
  saveDraft,
  loadDraft,
  clearDraft,
  purgeExpiredDrafts,
} from '@/utils/formDraft'

// Storage falso en memoria con la misma interfaz que localStorage.
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() { return map.size },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
  }
}

// Storage que revienta al escribir (cuota llena / modo privado de Safari).
function throwingStorage(): Storage {
  const base = fakeStorage()
  return { ...base, setItem: () => { throw new Error('QuotaExceededError') } }
}

describe('draftKey', () => {
  it('incluye versión, usuario y paciente', () => {
    expect(draftKey('user-1', 'pat-2')).toBe('consultation-draft:v1:user-1:pat-2')
  })
})

describe('saveDraft / loadDraft', () => {
  it('roundtrip: guarda y recupera campos con timestamp', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'Gripe', symptoms: 'Tos' }, 1000)
    const draft = loadDraft(s, key, 2000)
    expect(draft).not.toBeNull()
    expect(draft!.savedAt).toBe(1000)
    expect(draft!.fields).toEqual({ diagnosis: 'Gripe', symptoms: 'Tos' })
  })

  it('devuelve null si no hay borrador', () => {
    expect(loadDraft(fakeStorage(), draftKey('u', 'p'))).toBeNull()
  })

  it('borrador expirado (>24h): devuelve null y lo elimina', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'X' }, 0)
    expect(loadDraft(s, key, DRAFT_TTL_MS + 1)).toBeNull()
    expect(s.getItem(key)).toBeNull()
  })

  it('borrador justo dentro del TTL sigue vivo', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { diagnosis: 'X' }, 0)
    expect(loadDraft(s, key, DRAFT_TTL_MS)).not.toBeNull()
  })

  it('JSON corrupto devuelve null sin lanzar', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    s.setItem(key, '{esto no es json')
    expect(loadDraft(s, key)).toBeNull()
  })

  it('forma inválida (sin savedAt/fields) devuelve null y limpia', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    s.setItem(key, JSON.stringify({ otra: 'cosa' }))
    expect(loadDraft(s, key)).toBeNull()
    expect(s.getItem(key)).toBeNull()
  })

  it('storage null: no lanza y devuelve null', () => {
    expect(() => saveDraft(null, 'k', { a: '1' })).not.toThrow()
    expect(loadDraft(null, 'k')).toBeNull()
    expect(() => clearDraft(null, 'k')).not.toThrow()
    expect(() => purgeExpiredDrafts(null)).not.toThrow()
  })

  it('setItem que lanza (cuota llena): saveDraft no revienta', () => {
    expect(() => saveDraft(throwingStorage(), 'k', { a: '1' })).not.toThrow()
  })
})

describe('clearDraft', () => {
  it('elimina el borrador', () => {
    const s = fakeStorage()
    const key = draftKey('u', 'p')
    saveDraft(s, key, { a: '1' })
    clearDraft(s, key)
    expect(loadDraft(s, key)).toBeNull()
  })
})

describe('purgeExpiredDrafts', () => {
  it('elimina solo los borradores expirados con nuestro prefijo', () => {
    const s = fakeStorage()
    saveDraft(s, draftKey('u', 'viejo'), { a: '1' }, 0)
    saveDraft(s, draftKey('u', 'fresco'), { a: '2' }, DRAFT_TTL_MS)
    s.setItem('otra-app:key', 'no tocar')
    s.setItem(draftKey('u', 'corrupto'), '{{{')
    purgeExpiredDrafts(s, DRAFT_TTL_MS + 1)
    expect(s.getItem(draftKey('u', 'viejo'))).toBeNull()
    expect(s.getItem(draftKey('u', 'corrupto'))).toBeNull()
    expect(s.getItem(draftKey('u', 'fresco'))).not.toBeNull()
    expect(s.getItem('otra-app:key')).toBe('no tocar')
  })
})

describe('formDataToFields', () => {
  it('convierte FormData a record de strings, ignorando archivos', () => {
    const fd = new FormData()
    fd.append('diagnosis', 'Gripe')
    fd.append('symptoms', '')
    fd.append('archivo', new File(['x'], 'x.txt'))
    expect(formDataToFields(fd)).toEqual({ diagnosis: 'Gripe', symptoms: '' })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/formDraft.test.ts`
Expected: FAIL — "Cannot find module '@/utils/formDraft'" (o similar).

- [ ] **Step 3: Implementación mínima**

Crear `utils/formDraft.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/formDraft.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/formDraft.ts tests/formDraft.test.ts
git commit -m "feat(consultations): add local form draft module with 24h ttl"
```

---

### Task 2: Hook cliente `utils/useFormDraft.ts`

Hook delgado sin lógica de negocio (la lógica testeable vive en `formDraft.ts`; el hook solo
orquesta debounce y ciclo de vida — se cubre con el E2E de la Task 5, no con unit tests).

**Files:**
- Create: `utils/useFormDraft.ts`

**Interfaces:**
- Consumes (Task 1): `saveDraft`, `loadDraft`, `clearDraft`, `purgeExpiredDrafts`, `getLocalStorage`, `DraftPayload`.
- Produces (usado por Task 4):
  - `useFormDraft(storageKey: string, getSnapshot: () => Record<string, string>): { pendingDraft: DraftPayload | null; scheduleSave: () => void; discardDraft: () => void; resolvePendingDraft: () => void; clearSavedDraft: () => void }`

- [ ] **Step 1: Implementar el hook**

Crear `utils/useFormDraft.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add utils/useFormDraft.ts
git commit -m "feat(consultations): add useFormDraft autosave hook"
```

---

### Task 3: Componente `ConnectionBanner`

**Files:**
- Create: `app/dashboard/components/ConnectionBanner.tsx`

**Interfaces:**
- Consumes: nada.
- Produces (usado por Task 4): `export default function ConnectionBanner(): React.JSX.Element | null` — sin props.

- [ ] **Step 1: Implementar el componente**

Crear `app/dashboard/components/ConnectionBanner.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

/**
 * Aviso en vivo del estado de la conexión. Los eventos online/offline del navegador son
 * indicativos (puede haber falsos "online" con wifi sin internet), pero cubren el caso típico:
 * se cae la conexión mientras el médico llena un formulario largo. La señal definitiva de un
 * fallo sigue siendo el error del fetch al guardar.
 */
export default function ConnectionBanner() {
  const [status, setStatus] = useState<'online' | 'offline' | 'restored'>('online')

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) setStatus('offline')
    const goOffline = () => setStatus('offline')
    const goOnline = () => setStatus('restored')
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // "Conexión restablecida" se oculta solo a los 4 segundos.
  useEffect(() => {
    if (status !== 'restored') return
    const t = setTimeout(() => setStatus('online'), 4000)
    return () => clearTimeout(t)
  }, [status])

  if (status === 'online') return null

  const offline = status === 'offline'
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 1.1rem',
        borderRadius: '999px',
        fontSize: '0.85rem',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(15,23,42,0.25)',
        backgroundColor: offline ? '#7f1d1d' : '#065f46',
        color: '#ffffff',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      {offline ? <WifiOff size={16} style={{ flexShrink: 0 }} /> : <Wifi size={16} style={{ flexShrink: 0 }} />}
      {offline
        ? 'Sin conexión — tus cambios se están respaldando en este dispositivo'
        : 'Conexión restablecida'}
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/components/ConnectionBanner.tsx
git commit -m "feat(dashboard): add live connection status banner"
```

---

### Task 4: Integración en `NewConsultationClient.tsx`

**Files:**
- Modify: `app/dashboard/consultations/new/NewConsultationClient.tsx`

**Interfaces:**
- Consumes: `useFormDraft` (Task 2), `draftKey`/`formDataToFields` (Task 1), `ConnectionBanner` (Task 3).
- Produces: comportamiento final de UI (sin API nueva).

- [ ] **Step 1: Imports y constante de timeout**

En el bloque de imports, cambiar:

```ts
import React, { useState } from 'react'
```

por:

```ts
import React, { useEffect, useRef, useState } from 'react'
```

y agregar después del import de `clinicalTypes`:

```ts
import { draftKey, formDataToFields } from '@/utils/formDraft'
import { useFormDraft } from '@/utils/useFormDraft'
import ConnectionBanner from '../../components/ConnectionBanner'
```

Arriba del componente (después de la interfaz de props), agregar:

```ts
// Tiempo máximo de espera del guardado antes de liberar el botón. Si la petición sí llegó al
// servidor pero la respuesta se perdió, el mensaje de error le pide al médico verificar el
// expediente antes de reintentar (trade-off aceptado en el spec: sin clave de idempotencia).
const SAVE_TIMEOUT_MS = 30_000

// Campos que se restauran vía estado de React (controlados u ocultos); el resto se escribe
// directo en los inputs no controlados del formulario por su atributo name.
const DRAFT_STATE_FIELDS = new Set([
  'medicines_text',
  'include_diagnosis',
  'prescription_notes',
  'diagnosis',
  'treatment_plan',
  'lab_order',
  'study_request',
])
```

- [ ] **Step 2: Wiring del borrador dentro del componente**

Después de la línea `const [treatmentText, setTreatmentText] = useState('')`, agregar:

```ts
  const formRef = useRef<HTMLFormElement | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)

  // ── Borrador local (autosave + restauración) ─────────────────────────────
  // Snapshot del formulario completo: FormData cubre inputs con name (incluidos los hidden de
  // laboratorio/estudios); se agregan a mano el textarea de medicamentos (sin name) y el
  // checkbox (FormData omite checkboxes desmarcados).
  function getDraftSnapshot(): Record<string, string> {
    const form = formRef.current
    const fields = form ? formDataToFields(new FormData(form)) : {}
    fields.medicines_text = medicinesText
    fields.include_diagnosis = includeDiagnosis ? 'on' : ''
    return fields
  }

  const { pendingDraft, scheduleSave, discardDraft, resolvePendingDraft, clearSavedDraft } =
    useFormDraft(draftKey(currentUserId, patient.id), getDraftSnapshot)

  // Los cambios programáticos (modales de lab/estudios, botones de importar, "usar último")
  // no disparan onInput del form; este efecto los cubre. Se salta el primer render para no
  // guardar un borrador del formulario recién abierto sin tocar.
  const draftMountedRef = useRef(false)
  useEffect(() => {
    if (!draftMountedRef.current) {
      draftMountedRef.current = true
      return
    }
    scheduleSave()
  }, [medicinesText, prescriptionNotes, includeDiagnosis, diagnosisText, treatmentText, labOrder, studyRequest, scheduleSave])

  // El error puede aparecer lejos del botón Guardar (el alert vive arriba del formulario):
  // llevarlo a la vista para que el médico sí lo vea.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // Aplica un borrador restaurado: estado de React para los campos controlados/ocultos y
  // escritura directa por name para los no controlados.
  function applyDraft(fields: Record<string, string>) {
    setDiagnosisText(fields.diagnosis ?? '')
    setTreatmentText(fields.treatment_plan ?? '')
    setMedicinesText(fields.medicines_text ?? '')
    setPrescriptionNotes(fields.prescription_notes ?? '')
    setIncludeDiagnosis(fields.include_diagnosis === 'on')
    try {
      if (fields.lab_order) {
        const parsed = JSON.parse(fields.lab_order) as { tests?: { category: string; name: string }[]; otherTests?: string }
        setLabOrder({ tests: Array.isArray(parsed?.tests) ? parsed.tests : [], otherTests: parsed?.otherTests || '' })
      }
    } catch {
      // parte corrupta del borrador: se ignora, el resto se restaura igual
    }
    try {
      if (fields.study_request) {
        const parsed = JSON.parse(fields.study_request) as StudyRequestValue
        setStudyRequest({
          studies: Array.isArray(parsed?.studies) ? parsed.studies : [],
          otherStudies: parsed?.otherStudies || '',
          manualToCatalog: Array.isArray(parsed?.manualToCatalog) ? parsed.manualToCatalog : [],
        })
      }
    } catch {
      // idem
    }
    const form = formRef.current
    if (form) {
      for (const [name, value] of Object.entries(fields)) {
        if (DRAFT_STATE_FIELDS.has(name)) continue
        const el = form.elements.namedItem(name)
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value
      }
    }
    resolvePendingDraft()
  }
```

- [ ] **Step 3: handleSubmit con try/catch + timeout + limpieza del borrador**

Reemplazar el cuerpo de `handleSubmit` desde `const formData = new FormData(event.currentTarget)`
hasta la línea `const r = result && 'success' in result ? result : null` por:

```ts
    const formData = new FormData(event.currentTarget)
    const medicines = parseMedicinesText(medicinesText)

    let result: Awaited<ReturnType<typeof createConsultation>>
    try {
      // Promise.race: si la red se cayó a media petición el fetch puede quedarse colgado sin
      // rechazar nunca; el timeout libera el botón para que el médico pueda reintentar.
      result = await Promise.race([
        createConsultation(patient.id, appointmentId, medicines, formData, preclinical?.id ?? null),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('SAVE_TIMEOUT')), SAVE_TIMEOUT_MS)
        }),
      ])
    } catch {
      // Fallo de red o timeout: la consulta NO se guardó (desde el punto de vista del cliente).
      // Los datos siguen en el formulario y el borrador local sigue vivo; reintentar es volver
      // a presionar el mismo botón.
      setLoading(false)
      setError(
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'Sin conexión a internet. La consulta NO se guardó, pero tus datos están respaldados en este dispositivo. Revisa tu conexión e inténtalo de nuevo.'
          : 'No se pudo guardar la consulta. Revisa tu conexión e inténtalo de nuevo. Si el problema persiste, verifica en el expediente si la consulta ya quedó registrada antes de volver a guardar.'
      )
      return
    }

    if (result && 'error' in result && result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    const r = result && 'success' in result ? result : null

    // Guardado exitoso: el borrador local ya no hace falta (política: borrar al guardar).
    clearSavedDraft()
```

- [ ] **Step 4: JSX — banner de conexión, banner de restauración, ref del form y del error**

1. Inmediatamente después de `<div style={styles.container}>` agregar:

```tsx
      {/* Aviso en vivo si se pierde la conexión (el fetch del guardado es la señal definitiva) */}
      <ConnectionBanner />
```

2. Reemplazar `{error && <div style={styles.errorAlert}>{error}</div>}` por:

```tsx
      {error && <div ref={errorRef} style={styles.errorAlert}>{error}</div>}

      {/* Borrador local encontrado: ofrecer recuperarlo antes de que el médico escriba de nuevo.
          Mientras este banner espera decisión, el autosave está pausado. */}
      {pendingDraft && (
        <div style={styles.draftBanner}>
          <div>
            <strong style={{ display: 'block', fontSize: '0.9rem' }}>Encontramos una consulta sin guardar</strong>
            <span style={{ fontSize: '0.8rem' }}>
              Respaldada en este dispositivo el {formatDateTimeHN(new Date(pendingDraft.savedAt).toISOString())}. ¿Quieres recuperarla?
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button type="button" className="btn btn-primary" onClick={() => applyDraft(pendingDraft.fields)}>
              Restaurar
            </button>
            <button type="button" className="btn btn-secondary" onClick={discardDraft}>
              Descartar
            </button>
          </div>
        </div>
      )}
```

3. Reemplazar `<form onSubmit={handleSubmit} style={styles.form}>` por:

```tsx
      <form ref={formRef} onSubmit={handleSubmit} onInput={scheduleSave} style={styles.form}>
```

- [ ] **Step 5: Estilo del banner de borrador**

En el objeto `styles`, después de `errorAlert`, agregar:

```ts
  draftBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem',
    padding: '0.85rem 1rem',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: '10px',
    color: '#92400e',
  },
```

- [ ] **Step 6: Verificar compilación y tests**

Run: `npx tsc --noEmit && npm test`
Expected: sin errores de tipos; todos los tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/consultations/new/NewConsultationClient.tsx
git commit -m "fix(consultations): survive network loss on save with local draft recovery"
```

---

### Task 5: Verificación completa (E2E + build)

**Files:**
- Create (scratchpad, NO se commitea): script E2E puppeteer.

**Interfaces:**
- Consumes: todo lo anterior + patrón/credenciales del memory file `verificacion-e2e-puppeteer.md`.

- [ ] **Step 1: Leer el memory file de E2E** (`~/.claude/projects/-Users-jzuniga-Desktop-Desarrollo-de-software-Gestion-Medica/memory/verificacion-e2e-puppeteer.md`) para credenciales de prueba y gotchas del patrón.

- [ ] **Step 2: Levantar dev local** (`npm run dev` en background) y escribir el script E2E en el scratchpad siguiendo el patrón del memory. Flujo a verificar:
  1. Login → abrir `/dashboard/consultations/new?patientId=<paciente de prueba>`.
  2. Llenar motivo, diagnóstico, tratamiento y medicamentos → esperar >1.5 s (debounce) → verificar que existe `localStorage['consultation-draft:v1:...']`.
  3. `page.setOfflineMode(true)` → click "Finalizar Consulta & Recetar" → verificar: aparece el mensaje "Sin conexión a internet. La consulta NO se guardó..." y el botón vuelve a estar habilitado; verificar que aparece el ConnectionBanner ("Sin conexión —").
  4. `page.setOfflineMode(false)` → `page.reload()` → verificar banner "Encontramos una consulta sin guardar" → click "Restaurar" → verificar que los campos recuperaron sus valores.
  5. Click en guardar (online) → verificar éxito (modal de impresión o navegación al expediente) y que la clave del borrador desapareció de localStorage.

- [ ] **Step 3: Correr el script y revisar la salida.** Expected: todos los checks en verde. Si algo falla → superpowers:systematic-debugging antes de tocar código.

- [ ] **Step 4: Matar el dev server, luego correr la verificación pre-deploy**

Run (dev apagado primero — no correr build con dev vivo):
```bash
npm test && npm run build
```
Expected: tests PASS y build sin errores.

- [ ] **Step 5: Commit final si hubo ajustes y reportar al usuario** (el push a main lo decide el usuario: despliega a producción vía Vercel).

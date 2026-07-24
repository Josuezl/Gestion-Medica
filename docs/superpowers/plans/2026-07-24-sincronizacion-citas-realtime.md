# Sincronización de citas en vivo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cambios de citas hechos por un usuario (nueva, reprogramar, estado, cancelar) aparezcan solos en la agenda de cualquier otro usuario de la clínica, en ≈1 s, sin recargar.

**Architecture:** Se reúsa el patrón de Realtime ya en producción para signos vitales. Primero se extrae la base compartida del canal (autenticar el socket + salud) a `utils/realtimeChannel.ts`; luego un hook nuevo escucha la tabla `appointments` y AgendaClient mantiene un overlay "en vivo" (Map de citas + Set de canceladas) sobre las citas cargadas. Un núcleo de funciones puras decide, por evento, si ignorar / quitar / parchar en memoria / traer del servidor.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Supabase Realtime (`postgres_changes`) con `@supabase/ssr`, Vitest, Puppeteer para E2E.

## Global Constraints

- Node sin Homebrew: usar `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` en cada shell.
- TypeScript: **prohibido `any`** — usar `unknown` + narrowing y tipos explícitos.
- ESLint react-hooks (reglas nuevas): sin `setState` síncrono dentro de efectos ni lectura de refs durante el render; correr lint antes de commitear componentes cliente.
- Antes de desplegar: `npm run build` + `npm test` deben pasar. **No** correr `next build` con `next dev` vivo (desincroniza `.next`).
- Tras cada cambio de UI: E2E con puppeteer contra dev local (dos sesiones: médico + asistente).
- Realtime + `@supabase/ssr`: el socket conecta anónimo; hay que `supabase.realtime.setAuth(token)` **antes** de `subscribe()` o la RLS filtra todo. Esta lógica queda centralizada en `utils/realtimeChannel.ts` (Task 1).
- Toda feature es global: aplica a todos los tenants (incluye San Martín).
- El DDL lo ejecuta el usuario en Supabase; el archivo de migración va en el repo por paridad.

---

## File Structure

- **Create `utils/realtimeChannel.ts`** — base compartida: obtiene sesión, `setAuth`, arma el canal con N bindings de `postgres_changes`, escucha `system` para la salud, y expone `isLive`/`teardown`. Sin lógica de dominio.
- **Modify `utils/useRealtimePreclinical.ts`** — refactor para usar `realtimeChannel` (sin cambiar su comportamiento).
- **Create `utils/appointmentSync.ts`** — núcleo puro: tipos del evento, relevancia por ventana, clasificación del evento, parche y merge del overlay.
- **Create `tests/appointmentSync.test.ts`** — pruebas unitarias del núcleo puro.
- **Create `utils/useRealtimeAppointments.ts`** — hook que escucha `appointments` vía `realtimeChannel` y entrega (tipo de evento, fila cruda).
- **Modify `app/dashboard/actions.ts`** — nueva Server Action `getAppointmentById(id)` (mismo shape con joins).
- **Modify `app/dashboard/AgendaClient.tsx`** — overlay en vivo, manejo de eventos con coalescing, resaltado, y respaldo unificado.
- **Modify `app/dashboard/components/AppointmentCard.tsx`** — prop opcional de resaltado.
- **Modify `app/globals.css`** — animaciones CSS de resaltado y desvanecido.
- **Create `supabase/migrations/20260725000000_appointments_realtime.sql`** — publica `appointments` y le pone `replica identity full`.

---

## Task 1: Extraer la base compartida del canal de Realtime

**Files:**
- Create: `utils/realtimeChannel.ts`
- Modify: `utils/useRealtimePreclinical.ts`

**Interfaces:**
- Produces:
  - `interface PostgresBinding { event: 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; filter?: string; handler: (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => void }`
  - `function subscribeWithAuth(channelName: string, bindings: PostgresBinding[]): { isLive: () => boolean; teardown: () => void }`

Este task es un refactor de glue de WebSocket (no unit-testeable de forma pura); su red de seguridad es el build, el lint y el **E2E de signos que ya existe** (`01-sync.mjs`), que debe seguir pasando sin cambios de comportamiento.

- [ ] **Step 1: Crear `utils/realtimeChannel.ts`**

```ts
'use client'

import { createClient } from '@/utils/supabase/client'

/**
 * Base compartida de Realtime. Centraliza el fix del socket anónimo: con @supabase/ssr el
 * socket NO recibe el JWT del usuario al arrancar de cookies, así que hay que hacer
 * setAuth(token) ANTES de subscribe() o la RLS (auth.uid() = null) filtra TODOS los eventos.
 * También vigila el evento `system`: si los bindings son rechazados (p. ej. tabla no publicada
 * en Realtime), el rechazo llega DESPUÉS de que subscribe() reportó SUBSCRIBED, no en su status.
 */
export interface PostgresBinding {
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  /** Filtro de columna estilo `patient_id=eq.<id>`; sin él se escucha toda la tabla (RLS acota). */
  filter?: string
  /** newRow: fila nueva (INSERT/UPDATE). oldRow: fila previa (UPDATE/DELETE con replica identity full). */
  handler: (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => void
}

export function subscribeWithAuth(
  channelName: string,
  bindings: PostgresBinding[],
): { isLive: () => boolean; teardown: () => void } {
  const supabase = createClient()
  let bindingsRejected = false
  let live = false
  let cancelled = false
  let channel: ReturnType<typeof supabase.channel> | null = null

  async function setup() {
    const { data } = await supabase.auth.getSession()
    if (cancelled) return
    const token = data.session?.access_token
    if (token) await supabase.realtime.setAuth(token)
    if (cancelled) return

    let ch = supabase.channel(channelName)
    for (const b of bindings) {
      const source = b.filter
        ? { event: b.event, schema: b.schema, table: b.table, filter: b.filter }
        : { event: b.event, schema: b.schema, table: b.table }
      ch = ch.on<Record<string, unknown>>('postgres_changes', source, (p) => {
        b.handler(p.new ?? {}, p.old ?? {})
      })
    }
    channel = ch
      .on('system', {}, (payload: { status?: string } | null) => {
        if (payload?.status !== 'error') return
        bindingsRejected = true
        live = false
      })
      .subscribe((status) => {
        live = status === 'SUBSCRIBED' && !bindingsRejected
      })
  }
  void setup()

  return {
    isLive: () => live,
    teardown: () => {
      cancelled = true
      live = false
      if (channel) supabase.removeChannel(channel)
    },
  }
}
```

- [ ] **Step 2: Refactorizar `useRealtimePreclinical.ts` para usar la base**

Reemplazar el cuerpo del `useEffect` (líneas ~50-98) por una llamada a `subscribeWithAuth`, conservando el `liveRef` y el mapeo a `PreclinicalEventRow`:

```ts
import { subscribeWithAuth } from '@/utils/realtimeChannel'
// ...
  useEffect(() => {
    if (!enabled) return
    const filter = patientId ? `patient_id=eq.${patientId}` : undefined
    const handler = (newRow: Record<string, unknown>) => {
      const row = newRow as unknown as PreclinicalEventRow
      if (row?.id) onChangeRef.current(row)
    }
    const sub = subscribeWithAuth(`preclinical:${patientId ?? 'clinic'}`, [
      { event: 'INSERT', schema: 'public', table: 'preclinical_vitals', filter, handler },
      { event: 'UPDATE', schema: 'public', table: 'preclinical_vitals', filter, handler },
    ])
    const poll = setInterval(() => { liveRef.current = sub.isLive() }, 1000)
    return () => { clearInterval(poll); liveRef.current = false; sub.teardown() }
  }, [patientId, enabled])
```

Nota: `subscribeWithAuth` guarda `live` internamente; el hook lo refleja en su `liveRef` con un poll de 1 s (el respaldo solo lee `isLive()` al volver a la pestaña, no necesita precisión sub-segundo). Mantener `isLive` y el resto del archivo igual.

- [ ] **Step 3: Lint + typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit && npx eslint utils/realtimeChannel.ts utils/useRealtimePreclinical.ts`
Expected: sin errores.

- [ ] **Step 4: Regresión E2E de signos (no debe romperse)**

Con dev en :3100 arriba y datos reseteados, correr el E2E de sincronización de signos existente (`scratchpad/01-sync.mjs`) y confirmar `✓ ESCENARIO 1 OK`.

- [ ] **Step 5: Commit**

```bash
git add utils/realtimeChannel.ts utils/useRealtimePreclinical.ts
git commit -m "refactor(realtime): extract shared authed-channel helper"
```

---

## Task 2: Núcleo puro de sincronización (TDD)

**Files:**
- Create: `utils/appointmentSync.ts`
- Test: `tests/appointmentSync.test.ts`

**Interfaces:**
- Consumes: `Appointment` de `@/app/dashboard/AgendaClient`.
- Produces:
  - `interface AppointmentEventRow { id: string; scheduled_at: string; status: string; notes: string | null; duration_minutes: number; doctor_id: string; location_id: string | null; clinic_id?: string; patient_id?: string }`
  - `type SyncAction = { type: 'ignore' } | { type: 'remove'; id: string } | { type: 'patch'; id: string; row: AppointmentEventRow } | { type: 'fetch'; id: string }`
  - `function monthKey(iso: string): string` → `'YYYY-MM'` en hora de Honduras.
  - `function isWithinLoadedWindow(scheduledAt: string, loadedRangeStart: string, loadedRangeEnd: string, loadedMonthKeys: string[]): boolean`
  - `function classifyEvent(eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: AppointmentEventRow, ctx: { knownIds: Set<string>; isRelevant: (scheduledAt: string) => boolean }): SyncAction`
  - `function patchAppointment(existing: Appointment, row: AppointmentEventRow): Appointment`
  - `function mergeLiveAppointments(base: Appointment[], live: Map<string, Appointment>, removedIds: Set<string>): Appointment[]`

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
import { describe, it, expect } from 'vitest'
import {
  monthKey,
  isWithinLoadedWindow,
  classifyEvent,
  patchAppointment,
  mergeLiveAppointments,
  type AppointmentEventRow,
} from '@/utils/appointmentSync'
import type { Appointment } from '@/app/dashboard/AgendaClient'

const row = (over: Partial<AppointmentEventRow> = {}): AppointmentEventRow => ({
  id: 'a1', scheduled_at: '2026-07-24T16:00:00Z', status: 'CONFIRMED', notes: null,
  duration_minutes: 30, doctor_id: 'd1', location_id: 'l1', clinic_id: 'c1', patient_id: 'p1', ...over,
})
const appt = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1', scheduled_at: '2026-07-24T16:00:00Z', status: 'CONFIRMED', notes: null,
  duration_minutes: 30, doctor_id: 'd1', location_id: 'l1',
  patients: { id: 'p1', first_name: 'Ana', last_name: 'Ruiz', phone: '' } as Appointment['patients'], ...over,
})
const WIN_START = '2026-07-01T06:00:00Z'
const WIN_END = '2026-09-01T06:00:00Z'

describe('monthKey', () => {
  it('da YYYY-MM en hora de Honduras', () => {
    // 2026-08-01T04:00Z = 2026-07-31 22:00 en HN → mes 07
    expect(monthKey('2026-08-01T04:00:00Z')).toBe('2026-07')
    expect(monthKey('2026-08-01T16:00:00Z')).toBe('2026-08')
  })
})

describe('isWithinLoadedWindow', () => {
  it('true dentro de la ventana', () => {
    expect(isWithinLoadedWindow('2026-07-24T16:00:00Z', WIN_START, WIN_END, [])).toBe(true)
  })
  it('false fuera de la ventana y sin mes cargado', () => {
    expect(isWithinLoadedWindow('2026-12-10T16:00:00Z', WIN_START, WIN_END, [])).toBe(false)
  })
  it('true si el mes está cargado bajo demanda aunque salga de la ventana', () => {
    expect(isWithinLoadedWindow('2026-12-10T16:00:00Z', WIN_START, WIN_END, ['2026-12'])).toBe(true)
  })
})

describe('classifyEvent', () => {
  const relevant = { knownIds: new Set<string>(), isRelevant: () => true }
  const irrelevant = { knownIds: new Set<string>(), isRelevant: () => false }

  it('DELETE siempre pide quitar por id', () => {
    expect(classifyEvent('DELETE', row(), irrelevant)).toEqual({ type: 'remove', id: 'a1' })
  })
  it('INSERT relevante y desconocida → fetch', () => {
    expect(classifyEvent('INSERT', row(), relevant)).toEqual({ type: 'fetch', id: 'a1' })
  })
  it('INSERT no relevante → ignore', () => {
    expect(classifyEvent('INSERT', row(), irrelevant)).toEqual({ type: 'ignore' })
  })
  it('UPDATE relevante y conocida → patch', () => {
    const ctx = { knownIds: new Set(['a1']), isRelevant: () => true }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'patch', id: 'a1', row: row() })
  })
  it('UPDATE relevante y desconocida (entró a la ventana) → fetch', () => {
    const ctx = { knownIds: new Set<string>(), isRelevant: () => true }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'fetch', id: 'a1' })
  })
  it('UPDATE que salió de la ventana pero era conocida → remove', () => {
    const ctx = { knownIds: new Set(['a1']), isRelevant: () => false }
    expect(classifyEvent('UPDATE', row(), ctx)).toEqual({ type: 'remove', id: 'a1' })
  })
})

describe('patchAppointment', () => {
  it('parcha los campos del evento y conserva el join del paciente', () => {
    const out = patchAppointment(appt(), row({ status: 'WAITING', scheduled_at: '2026-07-24T18:00:00Z' }))
    expect(out.status).toBe('WAITING')
    expect(out.scheduled_at).toBe('2026-07-24T18:00:00Z')
    expect(out.patients?.first_name).toBe('Ana')
  })
})

describe('mergeLiveAppointments', () => {
  it('sobrescribe por id, agrega nuevas y excluye canceladas', () => {
    const base = [appt(), appt({ id: 'a2', status: 'PENDING' })]
    const live = new Map([['a2', appt({ id: 'a2', status: 'WAITING' })], ['a3', appt({ id: 'a3' })]])
    const out = mergeLiveAppointments(base, live, new Set(['a1']))
    const byId = Object.fromEntries(out.map(a => [a.id, a]))
    expect(byId.a1).toBeUndefined()          // cancelada
    expect(byId.a2.status).toBe('WAITING')   // sobrescrita por live
    expect(byId.a3).toBeDefined()            // nueva
  })
})
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx vitest run tests/appointmentSync.test.ts`
Expected: FAIL (módulo `@/utils/appointmentSync` inexistente).

- [ ] **Step 3: Implementar `utils/appointmentSync.ts`**

```ts
import type { Appointment } from '@/app/dashboard/AgendaClient'

/** Fila tal como viaja en el evento de Realtime: sin joins (no trae `patients`). */
export interface AppointmentEventRow {
  id: string
  scheduled_at: string
  status: string
  notes: string | null
  duration_minutes: number
  doctor_id: string
  location_id: string | null
  clinic_id?: string
  patient_id?: string
}

export type SyncAction =
  | { type: 'ignore' }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; row: AppointmentEventRow }
  | { type: 'fetch'; id: string }

const HN_TZ = 'America/Tegucigalpa'

/** 'YYYY-MM' del instante en hora de Honduras (misma convención que la agenda). */
export function monthKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: HN_TZ, year: 'numeric', month: '2-digit' })
    .formatToParts(new Date(iso))
  const y = parts.find(p => p.type === 'year')?.value ?? '0000'
  const m = parts.find(p => p.type === 'month')?.value ?? '00'
  return `${y}-${m}`
}

/** ¿La cita cae en la ventana precargada o en un mes ya traído bajo demanda? */
export function isWithinLoadedWindow(
  scheduledAt: string,
  loadedRangeStart: string,
  loadedRangeEnd: string,
  loadedMonthKeys: string[],
): boolean {
  const t = new Date(scheduledAt).getTime()
  if (t >= new Date(loadedRangeStart).getTime() && t < new Date(loadedRangeEnd).getTime()) return true
  return loadedMonthKeys.includes(monthKey(scheduledAt))
}

/** Decide qué hacer con un evento, sin tocar red ni estado. */
export function classifyEvent(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  row: AppointmentEventRow,
  ctx: { knownIds: Set<string>; isRelevant: (scheduledAt: string) => boolean },
): SyncAction {
  if (eventType === 'DELETE') return { type: 'remove', id: row.id }

  const relevant = ctx.isRelevant(row.scheduled_at)
  const known = ctx.knownIds.has(row.id)

  if (relevant) return known ? { type: 'patch', id: row.id, row } : { type: 'fetch', id: row.id }
  // No relevante: si estaba en pantalla (reprogramada fuera de la ventana), se quita; si no, nada.
  return known ? { type: 'remove', id: row.id } : { type: 'ignore' }
}

/** Aplica los campos del evento sobre una cita ya cargada, conservando sus joins. */
export function patchAppointment(existing: Appointment, row: AppointmentEventRow): Appointment {
  return {
    ...existing,
    scheduled_at: row.scheduled_at,
    status: row.status,
    notes: row.notes,
    duration_minutes: row.duration_minutes,
    doctor_id: row.doctor_id,
    location_id: row.location_id,
  }
}

/** Overlay en vivo sobre las citas base: live sobrescribe/agrega por id; removedIds se excluyen. */
export function mergeLiveAppointments(
  base: Appointment[],
  live: Map<string, Appointment>,
  removedIds: Set<string>,
): Appointment[] {
  const byId = new Map<string, Appointment>()
  for (const a of base) byId.set(a.id, a)
  for (const [id, a] of live) byId.set(id, a)
  const out: Appointment[] = []
  for (const a of byId.values()) if (!removedIds.has(a.id)) out.push(a)
  return out
}
```

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx vitest run tests/appointmentSync.test.ts`
Expected: PASS (todas).

- [ ] **Step 5: Commit**

```bash
git add utils/appointmentSync.ts tests/appointmentSync.test.ts
git commit -m "feat(agenda): add pure appointment-sync core with tests"
```

---

## Task 3: Server Action `getAppointmentById`

**Files:**
- Modify: `app/dashboard/actions.ts` (agregar junto a `getAppointmentsForRange`, ~línea 395)

**Interfaces:**
- Produces: `async function getAppointmentById(id: string): Promise<Appointment | null>` (shape con joins `patients` y `booking_requests`, acotado por `clinic_id`).

Es glue de datos (Server Action con Supabase); se verifica en el E2E de Task 8 (una cita nueva aparece con nombre real). No lleva unit test propio.

- [ ] **Step 1: Agregar la acción**

```ts
/**
 * Una cita puntual con el mismo shape (joins) que el dashboard. La usa la sincronización en
 * vivo: cuando llega un INSERT por Realtime, la fila del evento no trae el nombre del paciente,
 * así que se pide solo esa cita para pintar la tarjeta. Acotada por clínica (RLS + defensa).
 */
export async function getAppointmentById(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: authProfile } = await supabase
    .from('user_profiles').select('clinic_id').eq('id', user.id).single()
  if (!authProfile?.clinic_id) return null

  const { data } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      duration_minutes,
      doctor_id,
      location_id,
      patients (
        id,
        first_name,
        last_name,
        phone,
        id_card,
        gender,
        birth_date
      ),
      booking_requests (
        id,
        status,
        submitted_first_name,
        submitted_last_name,
        submitted_phone
      )
    `)
    .eq('clinic_id', authProfile.clinic_id)
    .eq('id', id)
    .maybeSingle()

  return data ?? null
}
```

- [ ] **Step 2: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/actions.ts
git commit -m "feat(agenda): add getAppointmentById server action"
```

---

## Task 4: Hook `useRealtimeAppointments`

**Files:**
- Create: `utils/useRealtimeAppointments.ts`

**Interfaces:**
- Consumes: `subscribeWithAuth`, `PostgresBinding` (Task 1); `AppointmentEventRow` (Task 2).
- Produces: `function useRealtimeAppointments(opts: { enabled?: boolean; onEvent: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: AppointmentEventRow) => void }): { isLive: () => boolean }`

Glue de hook; se verifica en el E2E de Task 8.

- [ ] **Step 1: Crear el hook**

```ts
'use client'

import { useCallback, useEffect, useRef } from 'react'
import { subscribeWithAuth } from '@/utils/realtimeChannel'
import type { AppointmentEventRow } from '@/utils/appointmentSync'

/**
 * Escucha en vivo la tabla `appointments` (INSERT/UPDATE/DELETE) para que los cambios de citas
 * de otro usuario aparezcan solos en la agenda. Sin filtro de columna: la RLS por clínica acota.
 * El DELETE trae la fila previa (requiere `replica identity full`, migración 20260725000000).
 */
export function useRealtimeAppointments({
  enabled = true,
  onEvent,
}: {
  enabled?: boolean
  onEvent: (eventType: 'INSERT' | 'UPDATE' | 'DELETE', row: AppointmentEventRow) => void
}): { isLive: () => boolean } {
  const onEventRef = useRef(onEvent)
  useEffect(() => { onEventRef.current = onEvent })

  const liveRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const table = 'appointments'
    const emit = (type: 'INSERT' | 'UPDATE' | 'DELETE') =>
      (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => {
        const raw = (type === 'DELETE' ? oldRow : newRow) as unknown as AppointmentEventRow
        if (raw?.id) onEventRef.current(type, raw)
      }
    const sub = subscribeWithAuth('appointments:clinic', [
      { event: 'INSERT', schema: 'public', table, handler: emit('INSERT') },
      { event: 'UPDATE', schema: 'public', table, handler: emit('UPDATE') },
      { event: 'DELETE', schema: 'public', table, handler: emit('DELETE') },
    ])
    const poll = setInterval(() => { liveRef.current = sub.isLive() }, 1000)
    return () => { clearInterval(poll); liveRef.current = false; sub.teardown() }
  }, [enabled])

  const isLive = useCallback(() => liveRef.current, [])
  return { isLive }
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit && npx eslint utils/useRealtimeAppointments.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add utils/useRealtimeAppointments.ts
git commit -m "feat(agenda): add appointments realtime hook"
```

---

## Task 5: Overlay en vivo + coalescing en AgendaClient

**Files:**
- Modify: `app/dashboard/AgendaClient.tsx`

**Interfaces:**
- Consumes: `useRealtimeAppointments` (Task 4); `classifyEvent`, `patchAppointment`, `mergeLiveAppointments`, `isWithinLoadedWindow`, `monthKey`, `AppointmentEventRow` (Task 2); `getAppointmentById` (Task 3).

- [ ] **Step 1: Importar y declarar el estado del overlay**

Cerca de los imports:
```ts
import { useRealtimeAppointments } from '@/utils/useRealtimeAppointments'
import { classifyEvent, patchAppointment, mergeLiveAppointments, isWithinLoadedWindow, monthKey, type AppointmentEventRow } from '@/utils/appointmentSync'
import { getAppointmentById } from './actions'
```

Junto al resto del estado del componente:
```ts
// Overlay de citas en vivo (Realtime): nuevas/cambiadas sobrescriben por id; canceladas se excluyen.
const [liveAppointments, setLiveAppointments] = useState<Map<string, Appointment>>(new Map())
const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
// Ids con resaltado temporal (recién llegadas/cambiadas) y en desvanecido (por cancelar).
const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
const [fadingIds, setFadingIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Fusionar el overlay en `allAppointments`**

Modificar `allAppointments` (líneas ~270-275) para aplicar el overlay al final:
```ts
const allAppointments = useMemo(() => {
  const extra = Object.values(extraByMonth).flat()
  const seen = new Set(initialAppointments.map(a => a.id))
  const base = extra.length === 0
    ? initialAppointments
    : [...initialAppointments, ...extra.filter(a => !seen.has(a.id))]
  return mergeLiveAppointments(base, liveAppointments, removedIds)
}, [initialAppointments, extraByMonth, liveAppointments, removedIds])
```

- [ ] **Step 3: Manejar los eventos con coalescing**

Agregar (después de `allAppointments`, para poder leer los ids conocidos):
```ts
// Ids de citas actualmente en memoria (base + live), para decidir patch vs fetch sin red.
const knownIdsRef = useRef<Set<string>>(new Set())
useEffect(() => { knownIdsRef.current = new Set(allAppointments.map(a => a.id)) }, [allAppointments])

// Meses cargados bajo demanda (para la relevancia por ventana).
const loadedMonthKeys = useMemo(() => Object.keys(extraByMonth), [extraByMonth])

// Cola de ids a traer del servidor, agrupados ~400 ms para no disparar N fetches en una ráfaga.
const fetchQueueRef = useRef<Set<string>>(new Set())
const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const flashHighlight = useCallback((id: string) => {
  setHighlightIds(prev => new Set(prev).add(id))
  setTimeout(() => setHighlightIds(prev => { const n = new Set(prev); n.delete(id); return n }), 3000)
}, [])

const drainFetchQueue = useCallback(() => {
  const ids = Array.from(fetchQueueRef.current)
  fetchQueueRef.current = new Set()
  ids.forEach(async (id) => {
    const appt = await getAppointmentById(id)
    if (!appt) return
    const a = appt as unknown as Appointment
    setRemovedIds(prev => { if (!prev.has(a.id)) return prev; const n = new Set(prev); n.delete(a.id); return n })
    setLiveAppointments(prev => new Map(prev).set(a.id, a))
    flashHighlight(a.id)
  })
}, [flashHighlight])

const queueFetch = useCallback((id: string) => {
  fetchQueueRef.current.add(id)
  if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
  fetchTimerRef.current = setTimeout(drainFetchQueue, 400)
}, [drainFetchQueue])

useRealtimeAppointments({
  onEvent: (eventType, row: AppointmentEventRow) => {
    const action = classifyEvent(eventType, row, {
      knownIds: knownIdsRef.current,
      isRelevant: (at) => isWithinLoadedWindow(at, loadedRangeStart, loadedRangeEnd, loadedMonthKeys),
    })
    if (action.type === 'ignore') return
    if (action.type === 'fetch') { queueFetch(action.id); return }
    if (action.type === 'patch') {
      const existing = allAppointments.find(a => a.id === action.id)
      if (!existing) { queueFetch(action.id); return }
      setLiveAppointments(prev => new Map(prev).set(action.id, patchAppointment(existing, action.row)))
      flashHighlight(action.id)
      return
    }
    if (action.type === 'remove') {
      // Desvanecer y luego quitar (600 ms coincide con la animación CSS).
      setFadingIds(prev => new Set(prev).add(action.id))
      setTimeout(() => {
        setFadingIds(prev => { const n = new Set(prev); n.delete(action.id); return n })
        setRemovedIds(prev => new Set(prev).add(action.id))
        setLiveAppointments(prev => { if (!prev.has(action.id)) return prev; const n = new Map(prev); n.delete(action.id); return n })
      }, 600)
    }
  },
})
```

Nota react-hooks: los `setTimeout`/`setState` viven en callbacks de evento (permitido), no en el cuerpo de un efecto.

- [ ] **Step 4: Lint + typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit && npx eslint app/dashboard/AgendaClient.tsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/AgendaClient.tsx
git commit -m "feat(agenda): live appointment overlay with coalesced fetches"
```

---

## Task 6: Resaltado visual (tarjeta + CSS)

**Files:**
- Modify: `app/dashboard/components/AppointmentCard.tsx`
- Modify: `app/dashboard/AgendaClient.tsx` (pasar la clase a la tarjeta en la vista Agenda)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `highlightIds`, `fadingIds` (Task 5).
- Produces: prop `highlightClass?: string` en `AppointmentCardProps`.

- [ ] **Step 1: Prop de resaltado en `AppointmentCard`**

En `AppointmentCardProps` agregar `highlightClass?: string`. En la firma del componente agregar `highlightClass = ''`. En el `<div className="appt-card-v2" ...>` (línea ~74):
```tsx
<div className={`appt-card-v2 ${highlightClass}`} style={{ borderLeftColor: cfg.dotColor }}>
```

- [ ] **Step 2: Pasar la clase desde la vista Agenda**

En `renderAgendaView` (línea ~758), en el `<AppointmentCard ...>`:
```tsx
highlightClass={highlightIds.has(app.id) ? 'appt-card-flash' : fadingIds.has(app.id) ? 'appt-card-fading' : ''}
```

- [ ] **Step 3: Animaciones CSS**

En `app/globals.css`:
```css
@keyframes apptFlash {
  0%   { background-color: #ecfdf5; box-shadow: 0 0 0 2px #6ee7b7 inset; }
  100% { background-color: transparent; box-shadow: none; }
}
.appt-card-flash { animation: apptFlash 3s ease-out; }

@keyframes apptFade {
  to { opacity: 0; transform: translateX(8px); }
}
.appt-card-fading { animation: apptFade 0.6s ease-in forwards; pointer-events: none; }
```

- [ ] **Step 4: Lint + typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit && npx eslint app/dashboard/components/AppointmentCard.tsx app/dashboard/AgendaClient.tsx`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/components/AppointmentCard.tsx app/dashboard/AgendaClient.tsx app/globals.css
git commit -m "feat(agenda): subtle highlight and fade for live appointment changes"
```

---

## Task 7: Respaldo unificado (canal caído → recargar al volver)

**Files:**
- Modify: `app/dashboard/AgendaClient.tsx`

**Interfaces:**
- Consumes: `isPreclinicalLive` (existente) y el `isLive` de `useRealtimeAppointments` (Task 4/5).

- [ ] **Step 1: Capturar el `isLive` de citas y unificar el respaldo**

Guardar el `isLive` que devuelve `useRealtimeAppointments` (Task 5) como `isAppointmentsLive`. Modificar el efecto de respaldo existente (líneas ~179-194) para exigir que **ambos** canales estén vivos; si alguno está caído, recargar una vez al volver a la pestaña:
```ts
const onBack = () => {
  if (document.visibilityState !== 'visible') return
  if (isPreclinicalLive() && isAppointmentsLive()) return
  if (Date.now() - lastCheck < PRECLINICAL_FALLBACK_MS) return
  lastCheck = Date.now()
  router.refresh()
}
```
Incluir `isAppointmentsLive` en el arreglo de dependencias del efecto.

- [ ] **Step 2: Lint + typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npx tsc --noEmit && npx eslint app/dashboard/AgendaClient.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/AgendaClient.tsx
git commit -m "feat(agenda): unify realtime fallback across both channels"
```

---

## Task 8: Migración, verificación E2E y despliegue

**Files:**
- Create: `supabase/migrations/20260725000000_appointments_realtime.sql`

- [ ] **Step 1: Escribir la migración (paridad repo↔BD)**

```sql
-- Sincronización en vivo de citas: publica `appointments` en Realtime para que los cambios de
-- un usuario (nueva cita, reprogramación, estado, cancelación) aparezcan solos en la agenda de
-- los demás sin recargar.
--
-- replica identity full: sin ella, el registro previo de un DELETE trae solo la PK y la RLS
-- (clinic_id = ...) no puede autorizar el evento → las cancelaciones no llegarían. Cuesta algo
-- más de WAL por UPDATE/DELETE, despreciable para el volumen de citas.
--
-- NO se toca RLS: las políticas por clinic_id de appointments (20260610030000) gobiernan también
-- Realtime. Idempotente.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table appointments;
  end if;
end $$;

alter table appointments replica identity full;
```

- [ ] **Step 2: El usuario ejecuta el DDL en Supabase**

Entregar al usuario el bloque `do $$ ... $$;` + `alter table ... replica identity full;` para que lo corra en el SQL editor de Supabase (mismo flujo que los signos). **Bloquear** la verificación E2E hasta que confirme que lo aplicó.

- [ ] **Step 3: Build de producción (con dev apagado)**

Run: `lsof -ti:3100 | xargs kill 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Suite unitaria completa**

Run: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH" && npm test`
Expected: todas verdes (incluye `appointmentSync.test.ts`).

- [ ] **Step 5: E2E con dos sesiones (médico + asistente)**

Escribir `scratchpad/03-citas.mjs` (reusar `helpers.mjs`) y verificar contra dev en :3100 con un paciente que tenga cita creada por Server Action de prueba:
  1. El médico mira su agenda de hoy; el asistente **crea** una cita para ese médico hoy → aparece sola, con resaltado, mostrando el nombre real del paciente (confirma `getAppointmentById`).
  2. El asistente **reprograma** la hora → la tarjeta se actualiza sin recargar (patch, 0 fetch).
  3. El asistente **cambia el estado** → se refleja.
  4. El asistente **cancela/elimina** → la tarjeta se desvanece y desaparece (confirma que `replica identity full` entrega el DELETE).
  5. Cambio para **otro médico** con el filtro en "solo yo" → no aparece.
  6. **Aislamiento**: una tercera sesión de otra clínica no recibe ningún evento (reusar el patrón de `scripts/rls-isolation-check.mjs` / tenants de prueba).

- [ ] **Step 6: Regresión de signos**

Re-correr `scratchpad/01-sync.mjs` → `✓ ESCENARIO 1 OK` (confirma que el refactor de Task 1 no rompió los signos).

- [ ] **Step 7: Commit y push a producción**

```bash
git add supabase/migrations/20260725000000_appointments_realtime.sql
git commit -m "feat(agenda): publish appointments to realtime with full replica identity"
git push origin main
```

- [ ] **Step 8: Verificar el deploy en producción**

`vercel ls --prod` hasta ver el commit en `● Ready`. Confirmar al usuario.

---

## Self-Review

- **Cobertura del spec:** ciclo completo (INSERT/UPDATE/DELETE) → Task 2/4/5; costo mínimo (patch/remove sin fetch, coalescing) → Task 2/5; fetch puntual → Task 3/5; relevancia por ventana → Task 2/5; resaltado sutil + desvanecido → Task 6; respaldo unificado → Task 7; DDL con `replica identity full` → Task 8; refactor a base compartida → Task 1; E2E dos sesiones + aislamiento → Task 8. Sin huecos.
- **Placeholders:** ninguno; todos los pasos llevan código real.
- **Consistencia de tipos:** `AppointmentEventRow`, `SyncAction`, `subscribeWithAuth`/`PostgresBinding`, `getAppointmentById`, `useRealtimeAppointments` se definen en su task y se consumen con las mismas firmas en Tasks 5-7. `Appointment` es el tipo exportado por `AgendaClient`.

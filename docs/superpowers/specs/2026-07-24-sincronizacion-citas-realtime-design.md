# Sincronización de citas en vivo en la agenda (Realtime)

**Fecha:** 2026-07-24
**Estado:** aprobado, pendiente de plan de implementación
**Depende de:** el patrón de Realtime ya en producción para `preclinical_vitals`
(ver `2026-07-24-sincronizacion-preclinica-realtime-design.md` y la memoria
`supabase-realtime-jwt-ssr`).

## Problema

Las citas que un asistente agrega, reprograma, cambia de estado o cancela **no** aparecen
en la agenda del médico hasta que este recarga la página. Cada pantalla es una foto tomada
en el render del servidor y nada la vuelve a tomar. Mismo patrón de fondo que ya resolvimos
para los signos vitales, pero sobre la tabla `appointments`.

## Objetivo

Que cualquier dashboard abierto de la clínica se mantenga al día en vivo (≈1 s) ante los
cambios de citas hechos por otro usuario, respetando el filtro (médico/clínica) y la ventana
de fechas que el espectador está viendo, con costo mínimo en Vercel.

## Por qué el costo NO es cero (a diferencia de los signos)

El evento de Realtime de la tabla `appointments` trae la fila **cruda**: `id`, `scheduled_at`,
`status`, `notes`, `duration_minutes`, `doctor_id`, `location_id`, `clinic_id`, `patient_id`.
**No** trae el objeto `patients` (nombre, teléfono, cédula) ni `booking_requests`, que la
tarjeta de la agenda necesita para renderizar (`app/dashboard/page.tsx` los arma con un join).
Y la agenda ya no precarga los pacientes en memoria. Por eso una cita **nueva** obliga a ir al
servidor a traer esos datos. Los demás eventos sí son gratis.

## Comportamiento por evento

| Evento | Acción en el cliente | Costo Vercel |
|---|---|---|
| **DELETE** (cancelación/borrado) | Quitar la tarjeta por `id` (con desvanecido) | 0 |
| **UPDATE** de una cita ya cargada (reprogramar, estado) | Parchar en memoria con los campos del payload | 0 |
| **UPDATE** que mueve la cita **hacia dentro** de la ventana pero no estaba cargada | Tratar como INSERT: `getAppointmentById(id)` | 1 consulta chica |
| **INSERT** dentro de la ventana visible | `getAppointmentById(id)` → insertar con join completo | 1 consulta chica |
| Cambio **fuera** de la ventana/mes cargado | Ignorar (se traerá al navegar ahí) | 0 |

Regla unificada para INSERT/UPDATE: si el `scheduled_at` del payload cae en la ventana cargada,
**y la cita no está en memoria**, se hace el fetch puntual; si ya está en memoria, se parcha
sin gastar. Un UPDATE cuyo nuevo `scheduled_at` sale de la ventana se trata como remoción de la
vista (se agrega a `removedIds`).

Regla de oro: **filtrar la relevancia en el cliente ANTES de gastar**. Solo se hace el fetch
si la cita cae dentro de `[loadedRangeStart, loadedRangeEnd]` o de un mes ya cargado en
`extraByMonth`. El filtro por médico/clínica lo sigue aplicando el render existente
(`AgendaClient` líneas ~343-350), no el fetch.

## Arquitectura

### Refactor previo (sirve a este trabajo)

Extraer la base compartida de Realtime a **`utils/realtimeChannel.ts`**: obtener la sesión,
`supabase.realtime.setAuth(token)` **antes** de suscribir (fix del socket anónimo), escuchar
el evento `system` para bajar la bandera de "vivo" si los bindings son rechazados, y limpiar
el canal al desmontar. Tanto `useRealtimePreclinical` como el nuevo hook lo usan. Beneficio:
el fix de autenticación queda en un solo lugar y no se puede reintroducir el bug del socket
anónimo en usos futuros de Realtime.

### Hook nuevo — `utils/useRealtimeAppointments.ts`

Suscribe la tabla `appointments` (INSERT/UPDATE/DELETE), **sin filtro** de columna — la RLS
por clínica ya acota. Entrega al consumidor el tipo de evento + la fila cruda (o el `id` en
DELETE). Expone `isLive()` para el respaldo. No decide nada de UI.

### Estado "en vivo" en AgendaClient

Overlay sobre `allAppointments` (que hoy fusiona `initialAppointments` + `extraByMonth`,
de-duplicando por `id`):

- `liveAppointments: Map<id, Appointment>` — citas nuevas (con join traído) y parches de UPDATE.
- `removedIds: Set<id>` — citas canceladas.
- Nuevo merge: `base` → aplicar `liveAppointments` (override por `id`) → excluir `removedIds`.

Como la de-duplicación es por `id`, el **eco** del propio usuario (que ya recibe
`revalidatePath` + `invalidateExtra` tras su acción) no duplica tarjetas; a lo sumo re-aplica
el mismo dato. Inofensivo.

### Fetch puntual — `getAppointmentById(id)` (server action nueva)

Devuelve una cita con el **mismo shape** que `page.tsx`/`getAppointmentsForRange` (join a
`patients` y `booking_requests`), acotada por `clinic_id` del perfil (RLS + defensa explícita).
Se usa solo para INSERT relevantes.

### Coalescing

Los eventos se agrupan ~400 ms: los `id` de INSERT relevantes pendientes se piden en un solo
lote (una llamada a `getAppointmentById` por id, o un `getAppointmentsForRange` acotado si son
varios) para que una ráfaga no dispare N fetches.

### Resaltado sutil

- `highlightedIds: Set<id>` — al recibir INSERT/UPDATE se marca el `id`; la tarjeta aplica una
  clase con animación breve (~3 s) y luego se limpia el id.
- Cancelación: la tarjeta pasa por un estado "saliendo" (clase de desvanecido ~600 ms) antes
  de quitarse de la lista.
- Sin animaciones que rompan con React 19: CSS puro por clase, nada que dependa de librerías
  de animación (ver memoria `recharts-react19-sin-animaciones` por precedente de gotchas).

### Respaldo unificado

El efecto de `visibilitychange`/`focus` que hoy existe para preclínica se generaliza: al volver
a la pestaña, si **algún** canal (preclínica o citas) está caído, se hace un `router.refresh()`
único (con el mismo freno de tiempo). Con los canales sanos no se gasta nada.

## DDL (lo ejecuta el usuario en Supabase; migración en el repo por paridad)

```sql
alter publication supabase_realtime add table appointments;
alter table appointments replica identity full;
```

`replica identity full` es la novedad frente a los signos: sin ella, el registro viejo de un
DELETE trae solo la PK y la RLS (`clinic_id = …`) no puede autorizar el evento → las
cancelaciones no llegarían. Costo: algo más de WAL por UPDATE/DELETE, despreciable para el
volumen de citas.

## Modo de falla

Si el canal no conecta o los bindings son rechazados, no llegan datos ajenos (la RLS falla
cerrada) y el respaldo mantiene la agenda al día al volver a la pestaña. El peor caso es
"igual que hoy" (hay que recargar), nunca datos incorrectos.

## Verificación

- **Unit**: la función de merge (base + live overrides − removed) y la de relevancia
  (¿cae en la ventana cargada?) como funciones puras en `tests/`.
- **E2E (puppeteer, dos sesiones médico + asistente)**:
  - El asistente crea una cita de hoy → aparece sola en la agenda del médico, con resaltado.
  - La reprograma → la tarjeta se mueve/actualiza sin recargar.
  - Cambia el estado → se refleja.
  - La cancela → se desvanece y desaparece (confirma que `replica identity full` entrega el DELETE).
  - Un cambio para OTRO médico respeta el filtro del espectador.
  - **Aislamiento**: una sesión de otra clínica no recibe ningún evento.
- `npm run build` + `npm test` en verde antes de desplegar.

## Alcance

**Incluido**: agenda del dashboard (vistas Agenda/Día/Semana/Mes) y modo historial.
**Fuera**: notificaciones push del navegador; el portal público de reservas
(`booking_requests` tiene su propia pantalla `/dashboard/solicitudes`); sincronizar otras
tablas. El hook y el `realtimeChannel.ts` quedan listos para reusarse en esos casos después.

## Aplica a todos los tenants

Como toda feature del proyecto, es global (incluye San Martín). No hay lógica por-clínica.

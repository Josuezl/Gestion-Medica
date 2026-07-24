# Sincronización en vivo de la pre-clínica (signos vitales)

Fecha: 2026-07-24
Estado: aprobado por el usuario, implementado

## Problema reportado

Un médico reportó: «a veces abro el sistema yo, luego mi asistente quiere meter los signos
vitales, pero no me aparecen a mí. No se sincroniza. Si los mete antes de que yo abra el
sistema sí aparecen.»

## Causa raíz

No existía **ningún** mecanismo de sincronización entre usuarios en la aplicación. Cada
pantalla es una foto del servidor tomada al abrirla, y nadie vuelve a tomarla:

1. `app/dashboard/page.tsx` resuelve `preclinicalPatientIds` una vez y `AgendaClient` lo
   congelaba en un `useMemo`. El badge «Preclínica lista» nunca aparecía si los signos se
   registraban después de cargar la agenda.
2. `app/dashboard/consultations/new/page.tsx` llama `getPendingPreclinical` una sola vez en
   el render del servidor. Además, los campos de signos usan `defaultValue` (inputs **no
   controlados**): aunque llegaran datos frescos, React no repinta un input ya montado, así
   que ni un `router.refresh()` los llenaría.
3. Verificado por búsqueda en todo el repo: cero `.channel()`/realtime, cero `setInterval`,
   cero `visibilitychange`. Los únicos `router.refresh()` se disparan después de que *el
   mismo usuario* guarda algo, nunca por cambios de otro usuario.

El fallo **no es intermitente**: es determinista según el orden de los eventos.

La escritura estaba bien: `PreclinicalVitalsModal` relee el estado fresco al abrirse, así que
nunca hubo riesgo de que un usuario borrara los datos del otro. El problema era solo de
lectura/refresco en la pantalla del médico.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Mecanismo | Supabase Realtime + respaldo | Instantáneo y con costo cero en Vercel |
| Al llegar datos con la consulta abierta | Nunca pisar lo que escribió el médico | Seguridad clínica |
| Respaldo | Solo si el canal está caído | Evita gasto de CPU redundante |

### Costo en Vercel (preocupación explícita del usuario)

El WebSocket va del navegador **directo a Supabase**; no pasa por Vercel. Y el evento de
`postgres_changes` trae la fila completa, así que ni el badge ni el autollenado necesitan
consultar al servidor.

| Pieza | Invocaciones en Vercel |
|---|---|
| Canal abierto todo el día | 0 (no pasa por Vercel) |
| Badge «Preclínica lista» aparece | 0 (dato en el payload) |
| Campos de signos se llenan solos | 0 (dato en el payload) |
| Volver a la pestaña, canal sano | 0 |
| Volver a la pestaña, canal caído | 1 consulta pequeña |
| Botón manual «Buscar signos» | 1 consulta pequeña, solo al hacer clic |

El techo se mueve a Supabase (plan Free: ~200 conexiones concurrentes, ~2M mensajes/mes),
que sobra para clínicas de este tamaño pero es la métrica a vigilar al crecer.

## Diseño

### 1. DDL (lo ejecuta el usuario en Supabase)

Publicar la tabla en `supabase_realtime`. **No se toca RLS**: la política por clínica que ya
tiene `preclinical_vitals` también gobierna Realtime. Ninguna otra tabla queda expuesta.
Queda registrada en `supabase/migrations/20260724000000_preclinical_vitals_realtime.sql`
para mantener la paridad repo↔BD.

### 2. `utils/preclinicalMerge.ts` — la decisión, como función pura

Una sola responsabilidad: decidir qué hacer con una fila entrante. Sin DOM, sin React, para
poder probarla con vitest (mismo patrón que `formDraft.ts`).

| Estado de los campos de signos | Acción |
|---|---|
| Todos vacíos | `autofill` — se llenan solos + aviso |
| Con algo que escribió el médico | `offer` — banda con botón, no se toca nada |
| Con lo que autollenamos antes, sin tocar | `autofill` — cubre correcciones de la asistente |

El tercer caso es el mismo principio dicho con precisión: se protege lo que escribió *el
médico*, no lo que puso el sistema. Un `0` cuenta como valor real, no como vacío.

### 3. `utils/useRealtimePreclinical.ts` — el canal

Escucha `INSERT` y `UPDATE` de `preclinical_vitals` y entrega la fila. No decide nada.

- Filtro opcional `patient_id=eq.<id>`: la consulta escucha un paciente, la agenda escucha
  toda la clínica (que RLS ya acota).
- Expone `isLive()` leyendo un ref (no provoca renders) para que el respaldo sepa si el canal
  está sano.
- Limpia el canal al desmontar.

### 4. Agenda — el badge aparece solo

Se conserva el set derivado de props (para que `router.refresh()` siga funcionando) y se le
aplica encima un `Map<patientId, boolean>` de correcciones que llegan por Realtime. Un evento
con `consumed_at` nulo agrega el badge; con `consumed_at` lleno (otro médico ya cerró esa
consulta) lo quita. Cero llamadas al servidor.

### 5. Nueva Consulta — autollenado seguro

- `preclinical` pasa de prop a estado. **Importante**: `createConsultation` recibe
  `preclinical?.id` para marcar la fila como consumida; debe leer del estado o se rompe la
  bitácora de quién tomó los signos.
- Al aplicar valores se escriben en los inputs no controlados con el idiom que ya usa
  `applyDraft`: `form.elements.namedItem(name).value`, y después `scheduleSave()` para que el
  borrador local quede al día.
- El aviso verde existente ahora también sirve para filas llegadas en vivo. Las que llegan por
  Realtime no traen el join con el nombre de quien tomó los signos (el payload es solo la
  fila); el aviso ya maneja el nombre ausente, y así el camino en vivo cuesta 0 invocaciones.

### 6. Respaldo

Al volver a la pestaña (`visibilitychange` + `focus`), con freno de 15 s:

```
¿el canal está suscrito? → no hacer nada        (caso normal: 0 invocaciones)
¿el canal está caído?    → reconsultar 1 vez    (solo cuando algo falló)
```

Más un botón discreto «Buscar signos» en la sección de signos vitales como escape manual.
Todo lo que entra por el respaldo pasa por la misma función de decisión, así que la regla de
no pisar lo escrito aplica igual.

### 7. Modo de falla

Si Realtime no llegara (token, red, publicación mal aplicada) el resultado es **ningún
evento**, nunca datos ajenos: RLS falla cerrado. El respaldo sigue funcionando. El cambio no
puede dejar el sistema peor que antes.

**Bug encontrado en el E2E (y corregido).** La primera versión medía la salud del canal solo
con el status de `subscribe()`, y eso miente: al suscribirse a una tabla NO publicada, el
servidor responde `phx_reply: {status: "ok"}` — con lo que supabase-js reporta `SUBSCRIBED` —
y solo DESPUÉS manda un mensaje `system` con `status: "error"` («Unable to subscribe to
changes with given parameters»). Resultado: el canal se reportaba sano, no entregaba nada, y
el respaldo nunca despertaba. Justo el peor caso, y en silencio.

La corrección escucha el evento `system` y baja la bandera; una vez rechazados los bindings,
el canal no vuelve a contarse como vivo mientras exista esa suscripción. El criterio quedó a
prueba de fallos: ante la duda, el respaldo corre (cuesta una consulta pequeña) en vez de
callarse.

**Segundo bug, la causa raíz de fondo (corregido).** Tras publicar la tabla, los eventos
seguían sin llegar al navegador aunque un script Node autenticado sí los recibía. Evidencia
dura (captura del WebSocket): el `phx_join` del navegador viajaba **sin `access_token`**. El
cliente de navegador de `@supabase/ssr` arranca la sesión desde cookies y no le pasa el JWT
al socket de Realtime, que se conecta **anónimo**; entonces la RLS (`auth.uid()` = null) filtra
TODOS los eventos y el canal queda «suscrito» pero mudo. La corrección: en el hook,
`await supabase.auth.getSession()` + `supabase.realtime.setAuth(token)` **antes** de suscribir.
Verificado: el `phx_join` pasa a `role: authenticated` y los signos llegan en ~1 s.

Este es el patrón obligatorio para CUALQUIER uso futuro de Realtime con RLS en esta app.

## Alcance

Incluido: agenda y Nueva Consulta.

Deliberadamente fuera: expediente del paciente y el resto de pantallas. Si el patrón funciona,
el hook queda listo para reusarse (citas nuevas, cambios de estado).

## Verificación

- `tests/preclinicalMerge.test.ts`: reglas puras, incluido el `0` como valor real.
- E2E con puppeteer y dos sesiones simultáneas (médico + asistente): el badge aparece solo,
  los campos se llenan solos, y lo que el médico tecleó sobrevive.
- Aislamiento: un usuario de otra clínica no debe recibir los eventos.
- `npm run build` + `npm test` en verde antes del push.

## Pendiente detectado, fuera de alcance

`preclinical_vitals.notes` (la observación de enfermería, p. ej. «paciente refiere mareo al
llegar») **no se muestra en ninguna parte del formulario de consulta**. La enfermera puede
escribirla y el médico nunca la ve. Es un hueco preexistente, no lo introduce este cambio.

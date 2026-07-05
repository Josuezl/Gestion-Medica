# Revisión Técnica — Calidad, Rendimiento, Arquitectura y Escalabilidad

> **Documento vivo.** Complementa a `auditoria_tecnica.md` (auditoría de seguridad del 2026-06-19,
> cuyos hallazgos altos ya están mitigados). Esta revisión se enfoca en **calidad de código,
> rendimiento, arquitectura, deuda técnica y cuellos de botella de escalamiento** sobre Vercel + Supabase.

| Campo | Valor |
|---|---|
| Proyecto | Gestión Médica / CloudMedHN |
| Fecha | 2026-07-05 |
| Rama revisada | `main` (commit `10445a5`) |
| Stack | Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + Storage) · Vercel · TypeScript strict |
| Alcance | Código del repositorio y migraciones. No incluye métricas de la BD viva ni datos de producción. |

---

## 1. Resumen ejecutivo

La base es **sólida para su etapa**: RLS en todas las tablas, TypeScript estricto sin `any`, lint en cero,
110 pruebas unitarias, migraciones fechadas, rate limiting consciente del entorno serverless, cliente
service-role bien encapsulado, y un middleware que excluye las rutas públicas del `getUser()`. La deuda
de seguridad ya tiene su propio documento y seguimiento.

Los riesgos actuales están en otra parte: **patrones de datos que no escalan con el volumen**
(la agenda carga todas las citas históricas de la clínica en cada render), **un cron de recordatorios
que por diseño no cubre la mayoría de las citas**, **navegación MPA que multiplica el costo por request**,
y **deuda estructural** (componentes cliente de 1,000–2,100 líneas, 1,315 estilos inline, tipos de BD a mano).
Con San Martín ya en producción y más clínicas por venir, los hallazgos P0 crecen linealmente con el uso:
conviene atacarlos antes de sumar tenants.

### Tabla de hallazgos

| ID | Área | Prioridad | Hallazgo | Esfuerzo |
|----|------|-----------|----------|----------|
| P0-1 | Rendimiento/Escala | 🔴 P0 | La agenda carga **todas** las citas de la clínica sin filtro ni límite | Medio |
| P0-2 | Funcional/Arquitectura | 🔴 P0 | Cron de recordatorios: ventanas incompatibles con la frecuencia diaria | Bajo |
| P0-3 | Robustez/Rendimiento | 🔴 P0 | Búsqueda de pacientes: entrada sin escapar en `.or()` + `ilike '%…%'` sin índice trigram | Bajo–Medio |
| P1-1 | Rendimiento | 🟠 P1 | Sidebar navega con `<a href>` → recarga completa en cada clic | Bajo |
| P1-2 | Rendimiento/Escala | 🟠 P1 | `getUser()` + `user_profiles` consultados 3–4 veces por request | Medio |
| P1-3 | Integridad/Arquitectura | 🟠 P1 | Guardado de consulta: 5+ escrituras no atómicas (warnings ante fallo parcial) | Medio |
| P1-4 | Proceso | 🟠 P1 | Sin CI: `main` = producción y el gate build/test es disciplina manual | Bajo |
| P1-5 | Calidad/Tipado | 🟠 P1 | Sin tipos generados de Supabase; 23 casts `as unknown as` | Medio |
| P2-1 | Deuda técnica | 🟡 P2 | Componentes cliente monolíticos (2,139 / 1,289 / 938 / 884 líneas) | Alto (incremental) |
| P2-2 | Deuda técnica | 🟡 P2 | 1,315 `style={{…}}` inline, sin sistema de componentes UI | Alto (incremental) |
| P2-3 | Calidad | 🟡 P2 | Pruebas solo en utils puros; RLS y server actions sin cobertura (Fase 2 de la auditoría pendiente) | Medio |
| P2-4 | Arquitectura BD | 🟡 P2 | Fuente de verdad difusa: `schema.sql` + `optimize.sql` + migraciones + DDL manual en Supabase | Bajo |
| P2-5 | Rendimiento | 🟡 P2 | Recharts importado estático en 3 componentes cliente (bundle inicial) | Bajo |
| P3-* | Varios | 🟢 P3 | Detalles menores (ver §5) | Bajo |

---

## 2. Hallazgos P0 — atacar antes de sumar tenants

### P0-1 · La agenda carga todas las citas de la clínica, para siempre

**Evidencia:** `app/dashboard/page.tsx:43-71` consulta `appointments` con joins a `patients` y
`booking_requests` filtrando **solo por `clinic_id`** — sin rango de fechas, sin `limit`, sin filtro de
estado. El resultado completo se serializa al cliente y `AgendaClient` (1,289 líneas) lo filtra en memoria
(`app/dashboard/AgendaClient.tsx:238-256`).

**Por qué importa:** el dashboard es la página más visitada del sistema y su costo crece linealmente con
el historial: query más lenta, payload SSR más pesado (cada cita arrastra los datos del paciente), más RAM
y más re-render en el navegador. Una clínica activa genera miles de citas al año; con 10 clínicas × 2 años
esto se vuelve el cuello de botella número uno. Ya resolvieron este mismo patrón para pacientes
(`searchPatientsForAgenda` server-side) — falta aplicarlo a las citas.

**Recomendación:**
1. Filtrar en el servidor por el rango visible (p. ej. mes actual ± 1 semana) y cargar rangos adicionales
   con una server action al navegar el calendario (el patrón de `searchPatientsForAgenda` sirve de molde).
2. Excluir estados terminales antiguos si la UI no los muestra.
3. Índice compuesto para la consulta caliente: `create index on appointments (clinic_id, scheduled_at);`
   (hoy existen índices separados por columna; el compuesto evita el bitmap-and en la query principal).

### P0-2 · Cron de recordatorios: la mayoría de las citas nunca recibe recordatorio

**Evidencia:** `vercel.json` programa `/api/send-reminders` **una vez al día a las 08:00 UTC**. Pero
`app/api/send-reminders/route.ts:33-35` busca citas en una ventana de **23–25 h** y `:57-59` en una de
**1.5–2.5 h**. Con una sola corrida diaria:
- Recordatorio 24 h: solo citas de mañana entre ~07:00–09:00 UTC.
- Recordatorio 2 h: solo citas de hoy entre ~09:30–10:30 UTC.
- Todo lo demás queda sin recordatorio, silenciosamente.

Además los envíos de WhatsApp son secuenciales (`route.ts:80-127`) y **no se registra qué recordatorio ya
se envió**, así que aumentar la frecuencia del cron sin más produciría duplicados.

**Recomendación:**
1. Cron cada hora: `"schedule": "0 * * * *"` con ventanas de ±30 min alineadas a esa frecuencia.
2. Idempotencia: columnas `reminder_24h_sent_at` / `reminder_2h_sent_at` en `appointments` (o tabla de
   envíos), marcadas en la misma corrida; filtrar por `is null` en la query.
3. Envíos con concurrencia limitada (`Promise.allSettled` por lotes de ~5) y `maxDuration` explícito en
   la ruta para no rozar el límite de la función cuando crezca el volumen.

### P0-3 · Búsqueda de pacientes: filtro rompible por el usuario y sin índice utilizable

**Evidencia:** `app/dashboard/patients/page.tsx:65` interpola cada palabra de búsqueda directamente en
`.or(\`first_name.ilike.%${word}%,…\`)`. En PostgREST, `,` `(` `)` son sintaxis del filtro: una búsqueda
con coma o paréntesis (p. ej. "Pérez, Juan") rompe la consulta (400) o altera la semántica del filtro.
No es inyección SQL, pero sí un bug alcanzable desde el buscador y una superficie de manipulación del filtro.

Además, cada palabra genera 5 `ilike '%…%'` (nombre, apellido, cédula, teléfono, expediente). El wildcard
inicial impide usar los índices btree existentes (`idx_patients_names`): cada búsqueda es un seq scan por
palabra. Con decenas de miles de pacientes por clínica se sentirá.

**Recomendación:**
1. Sanitizar la entrada antes de interpolar (eliminar `,()."'\\` o usar el escape de PostgREST). Es un
   cambio de 3 líneas; mismo patrón dondequiera que se use `.or()` con input del usuario
   (revisar también `searchPatientsForAgenda`).
2. Índice trigram para búsqueda por substring:
   ```sql
   create extension if not exists pg_trgm;
   create index idx_patients_search_trgm on patients
     using gin ((first_name || ' ' || last_name || ' ' || coalesce(id_card,'')
       || ' ' || coalesce(phone,'') || ' ' || coalesce(record_number,'')) gin_trgm_ops);
   ```
   y buscar contra esa expresión concatenada (una sola condición `ilike` por palabra en vez de 5).

---

## 3. Hallazgos P1 — rendimiento y arquitectura

### P1-1 · Navegación del sidebar con `<a href>` (recarga completa)

`app/dashboard/layout.tsx:29` (`SidebarLink`) usa `<a>` en lugar de `next/link`, y quedan ~12 `<a href`
internos en el repo (la limpieza de lint corrigió 5, pero la regla no detecta `href` dinámicos como este).
Cada clic del sidebar es un full page load: se repite el `getUser()` del middleware, las 3 queries del
layout, se pierde el router cache de Next y se re-descarga todo el JS. Es probablemente la mejora de
"sensación de velocidad" más barata disponible: cambiar `<a>` → `<Link>` en `SidebarLink` y auditar el resto
con `grep -rn '<a href' app`.

### P1-2 · Auth y perfil consultados 3–4 veces por request

Hay 44 llamadas a `getUser()` y 54 selects a `user_profiles` en `app/`. En un render del dashboard se
ejecutan: middleware (`getUser`) → layout (`getUser` + perfil + count de solicitudes) → página (`getUser` +
perfil) → `greeting-data` (`getUser` + perfil). Cada `getUser()` es un roundtrip al servidor de Auth de
Supabase; los selects repetidos suman latencia y, al escalar, presión sobre los rate limits de Auth.

**Recomendación:** un helper memoizado por request con `React.cache()`:

```ts
import { cache } from 'react'
export const getSessionProfile = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles')
    .select('id, clinic_id, first_name, last_name, role, is_org_admin, specialty, gender').eq('id', user.id).single()
  return { user, profile }
})
```

Layout, páginas y `greeting-data` lo comparten dentro del mismo render: 1 llamada a Auth y 1 select en vez
de 3–4 de cada uno. (Las server actions sí deben seguir validando por su cuenta — eso es correcto hoy.)

### P1-3 · Guardado de consulta: escrituras multi-paso no atómicas

`app/dashboard/consultations/actions.ts:130-345`: consulta → antecedentes → receta → orden de laboratorio →
solicitud de estudios → update de cita → consumo de pre-clínica, como inserts/updates independientes. Los
fallos parciales ya se comunican con `warnings` (mitigación A3 de la auditoría), pero el registro clínico
puede quedar incompleto y son 6–8 roundtrips por guardado.

**Recomendación:** consolidar en una función Postgres transaccional (`create_consultation_bundle(...)`)
invocada por RPC, como ya se hizo con `create_public_booking`. Beneficio doble: atomicidad real (todo o
nada) y 1 roundtrip en lugar de 8. Es el candidato natural a siguiente migración "grande".

### P1-4 · Sin CI, con `main` desplegando directo a producción

No existe `.github/workflows/`. El flujo actual (push a `main` → Vercel producción) depende de la
disciplina de correr `npm run build` + `npm test` localmente. Con una clínica real en producción, un push
descuidado llega a usuarios en minutos.

**Recomendación:** workflow mínimo de GitHub Actions (lint + build + test en cada push/PR) + branch
protection en `main`. Son ~30 líneas de YAML y elimina la clase entera de "se me olvidó correr el build".
Ideal complementario: trabajar en ramas y aprovechar los preview deployments de Vercel que ya tienen.

### P1-5 · Tipos de la BD a mano

Los clientes de `utils/supabase/*` no usan el genérico `Database`, y hay 23 casts `as unknown as`
(la mayoría para joins a-uno que la inferencia reporta como arreglo). Cada cambio de esquema depende de
actualizar interfaces a mano (`utils/clinicalTypes.ts`, tipos locales por archivo) — el drift repo↔BD
que ya les preocupa a nivel DDL también existe a nivel de tipos.

**Recomendación:** `npx supabase gen types typescript --project-id … > utils/supabase/database.types.ts`,
tipar `createServerClient<Database>` / `createClient<Database>`, y regenerar como paso posterior a cada
migración. Elimina los casts, y los joins a-uno se resuelven con la sintaxis `tabla!inner` o hints de FK.

---

## 4. Hallazgos P2 — deuda técnica a planificar

### P2-1 · Componentes cliente monolíticos

`PatientDetailsClient.tsx` (2,139 líneas), `AgendaClient.tsx` (1,289), `NewConsultationClient.tsx` (938),
`ConfigClient.tsx` (884), `PatientHistoryTabs.tsx` (827). Consecuencias: cualquier cambio arriesga
regresiones en features no relacionadas, cada tecla en un formulario re-renderiza el árbol entero, y todo
el código de todas las pestañas viaja en el bundle inicial de la página.

**Recomendación (incremental, no big-bang):** cuando toquen una de estas pantallas por un feature, extraer
la pestaña/sección afectada a su propio componente con estado local (el patrón de `PatientHistoryTabs` y
los modales ya extraídos van en la dirección correcta). Regla práctica sugerida: ningún archivo nuevo
>400 líneas; los existentes se dividen al tocarlos.

### P2-2 · 1,315 estilos inline y ausencia de sistema UI

Chips, cards, badges y headers se re-implementan con objetos `style` en cada página (y hay objetos muertos,
p. ej. `styles.container`/`styles.header` sin uso en `app/dashboard/layout.tsx:168-341`). Costos: aspecto
inconsistente entre pantallas, imposibilidad de theming, y no hay `:hover`/media queries en inline styles
(por eso conviven clases CSS globales + inline, dos sistemas a medias).

**Recomendación:** no reescribir; consolidar. Extraer 5–6 componentes UI (`<Chip>`, `<Card>`, `<PageHeader>`,
`<StatBadge>`, `<EmptyState>`) sobre las clases CSS globales existentes y usarlos en código nuevo. La media
docena de patrones repetidos cubre la gran mayoría de los 1,315 usos con el tiempo.

### P2-3 · Cobertura de pruebas limitada a utils puros

110 tests pasan, pero todos sobre `utils/` (validación, booking, permisos…). Cero cobertura de server
actions, políticas RLS o flujos (el E2E de puppeteer es manual). La Fase 2 de la auditoría (tests RLS)
sigue pendiente. Al ritmo actual de features, el E2E manual será el cuello de botella de verificación.

**Recomendación:** (1) tests de RLS contra Supabase local (`supabase start`) para las 4–5 tablas más
sensibles — es la pieza pendiente de la auditoría; (2) tests de integración de las 3 actions críticas
(crear consulta, aprobar booking, crear paciente); (3) automatizar el guion de puppeteer existente como
script reproducible que corra en CI (encaja con P1-4).

### P2-4 · Fuente de verdad difusa en la BD

Conviven `supabase/schema.sql` (esquema base histórico), `supabase/optimize.sql` (índices + notas), 36
migraciones fechadas, y el flujo real donde el DDL se ejecuta a mano en el editor SQL de Supabase. Para un
entorno nuevo (staging, restore, segunda región) no está claro qué ejecutar ni en qué orden.

**Recomendación:** declarar las migraciones como única fuente de verdad: mover el contenido vigente de
`optimize.sql` a una migración, marcar `schema.sql`/`optimize.sql` como `-- HISTÓRICO, no ejecutar`, y
periódicamente validar drift con `supabase db diff` contra producción. Bajo esfuerzo, elimina una clase
entera de sorpresas.

### P2-5 · Recharts en el bundle inicial

`ReportsClient.tsx`, `PediatricGrowthChart.tsx` y `DiagnosesBarChart.tsx` importan `recharts` estáticamente
(~100 KB+ gzip) en componentes cliente. En el expediente del paciente y la nueva consulta, el chart es
secundario pero encarece el primer paint.

**Recomendación:** `next/dynamic` con `ssr: false` y un placeholder para los tres componentes de gráficas.

---

## 5. Hallazgos P3 — menores

1. **`.eq('clinic_id', clinicId || '')`** (patrón repetido): si el perfil no cargó, se compara un uuid con
   `''` → error 22P02 de Postgres en lugar de un fallo controlado. Validar perfil y retornar temprano.
2. **Triple `count: 'exact'` por render** en `app/dashboard/patients/page.tsx:96-100` (más el count de la
   lista). Los counts exactos escanean; con tablas grandes usar `count: 'estimated'` para las cabeceras o
   cachear los totales.
3. **`@types/qrcode` en `dependencies`** — mover a `devDependencies`.
4. **Higiene del repo:** `LIMPIEZA-LINT.md`, `plan_seguridad_pendientes.md`, `auditoria_tecnica.md` y las
   carpetas `Migracion ` / `San Martin` (con espacio y sin extensión clara) en la raíz. Mover documentación
   a `/docs` y datos de clínicas fuera del repo (contienen potencialmente PHI y el repo viaja completo a
   cada máquina/agente).
5. **Dead code de estilos** en `app/dashboard/layout.tsx:168-341` (objetos no referenciados).

---

## 6. Nota transversal: postura de escalamiento en Vercel + Supabase

Lo que ya está bien resuelto para escalar:
- **Conexiones:** todo el acceso es vía PostgREST (supabase-js), sin pool propio → sin riesgo de agotar
  conexiones Postgres desde serverless. ✓
- **Rate limiting** respaldado en BD (no en memoria del proceso) con fail-open documentado. ✓
- **Middleware** excluye rutas públicas (`/agendar`, `/citas`, webhook) del `getUser()`. ✓
- **RLS** con subconsultas `(select … where id = auth.uid())` — patrón cacheable por statement. ✓
- **Storage** con cuotas por tenant ya migradas. ✓
- **PDF bajo demanda** (no se genera/almacena por consulta). ✓

Los límites que van a tocar primero, en orden probable:
1. **Payload/tiempo del dashboard** por P0-1 (crece con el historial de citas).
2. **Duración de la función del cron** por envíos secuenciales de WhatsApp (P0-2).
3. **Rate limits de Supabase Auth** por los `getUser()` repetidos (P1-2), multiplicados por la navegación
   MPA (P1-1).
4. **Seq scans de búsqueda** de pacientes (P0-3) al crecer el padrón.

---

## 7. Plan de acción sugerido (orden de ejecución)

| Semana | Acciones | Resultado |
|---|---|---|
| 1 | P0-2 (cron horario + idempotencia) · P0-3.1 (sanitizar `.or()`) · P1-1 (`<Link>`) · P1-4 (CI mínimo) | Recordatorios funcionando, buscador robusto, navegación instantánea, red de seguridad en `main` |
| 2 | P0-1 (agenda por rango + índice compuesto) · P0-3.2 (índice trigram) | Dashboard y búsqueda con costo constante ante el crecimiento |
| 3 | P1-2 (`getSessionProfile` con `cache()`) · P1-5 (tipos generados) | Menos latencia por request, casts eliminados |
| 4+ | P1-3 (RPC transaccional de consulta) · P2-3 (tests RLS) · P2-4 (migraciones como fuente de verdad) · P2-1/P2-2 en modo incremental | Integridad clínica atómica y deuda bajando con cada feature |

---

## 8. Seguimiento

| ID | Estado | Fecha | Notas |
|----|--------|-------|-------|
| P0-1 | ✅ Mitigado | 2026-07-05 | Ventana [−30, +120] días + `getAppointmentsForRange` bajo demanda por mes. Índice compuesto en `20260705010000_performance_indexes.sql` (**DDL pendiente de correr**). |
| P0-2 | ✅ Mitigado (apagado) | 2026-07-05 | Lógica idempotente (`reminder_*_sent_at`) + hora de Honduras, **gateado con `AUTO_REMINDERS_ENABLED`** (hoy los recordatorios son manuales, decisión del usuario). ⚠️ El plan **Hobby de Vercel rechaza crons no diarios** (bloqueó el deploy): el cron quedó diario 13:00 UTC; al activar el envío automático se necesita Vercel Pro o un scheduler externo (GitHub Actions cron → GET con `CRON_SECRET`). Migración `20260705000000_...` solo se necesita al encenderlo. |
| P0-3 | ✅ Mitigado | 2026-07-05 | `sanitizeSearchTerm` (5 sitios `.or()`, con tests). Índices trigram en `20260705010000_performance_indexes.sql` (**DDL pendiente de correr**). |
| P1-1 | ✅ Mitigado | 2026-07-05 | `SidebarLink` client con `next/link` (cierra menú móvil); 0 `<a href>` internos restantes. |
| P1-2 | ✅ Mitigado | 2026-07-05 | `utils/session.ts` (`getSessionProfile` con `React.cache()`) aplicado a layout, dashboard, pacientes, consultas y greeting. |
| P1-3 | ⏳ Pendiente | — | RPC transaccional de guardado de consulta. |
| P1-4 | ✅ Mitigado | 2026-07-05 | `.github/workflows/ci.yml` (lint + test + build en push/PR). |
| P1-5 | ⏳ Pendiente | — | Requiere acceso al proyecto de Supabase para `gen types`. |
| P2-1…P2-4 | ⏳ Pendiente | — | Incremental. |
| P2-5 | ✅ Mitigado | 2026-07-05 | Charts diferidos con `next/dynamic` (3 sitios cliente). |
| P3 | 🟡 Parcial | 2026-07-05 | `@types/qrcode` → devDeps; estilos muertos del layout eliminados. Guard de `clinicId` y counts estimados pendientes. |

Verificación del 2026-07-05: `npm run lint` limpio · 136/136 tests · `npm run build` OK · E2E puppeteer 8/8
(login, agenda acotada, navegación sin recarga, búsquedas hostiles, mes fuera de ventana, reportes).

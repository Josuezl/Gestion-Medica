# Plan de trabajo — Pendientes de seguridad y arquitectura

> Continúa la mitigación de [auditoria_tecnica.md](auditoria_tecnica.md). Aquí está **lo que falta**, con
> detalle por ítem y el **orden recomendado de ejecución**. Documento vivo: marcar el avance a medida que se
> completa.

## Contexto

Ya están mitigados los 5 hallazgos **ALTA** (A1–A5, con A5 solo en Fase 1) y varios **Media/Baja** (M2, M3,
M6, B5). Quedan pendientes los de abajo. Algunos son solo código (se despliegan por el flujo normal de Vercel),
otros necesitan un **entorno de pruebas (staging)** o una **decisión tuya**.

## Orden recomendado (resumen)

| # | Ítem | Tipo | Requiere | Esfuerzo | Valor |
|---|------|------|----------|----------|-------|
| 1 | ✅ **M4** — minimizar datos en página pública | Código | — | Bajo | Privacidad |
| 2 | ✅ **M5** — firmar URLs de estudios bajo demanda | Código | — | Medio | Rendimiento |
| 3 | **M7** — archivar bitácora antes de borrar tenant | Código + SQL | Tu decisión | Medio | Integridad/auditoría |
| 4 | **Infra** — staging + esquema versionado (CLI) | Infra | Tú creas el proyecto | Medio | Habilitador |
| 5 | **A5 Fase 2** — test de aislamiento RLS | Código (tests) | #4 (staging) | Medio | **Seguridad (alto)** |
| 6 | **M1** — estandarizar políticas RLS | SQL | #4 (probar en staging) | Bajo | Robustez |
| 7 | **M8 (resto)** — rate-limiting | Código + servicio | Upstash/Vercel KV | Medio | Anti-abuso |
| 8 | **B1** — partir componentes monolíticos | Refactor | — | Alto | Mantenibilidad |
| 9 | **B2** — sistema de diseño (quitar inline) | Refactor | — | Alto | Mantenibilidad |

**Lógica del orden:** primero las mejoras de **solo código** que son seguras y dan valor inmediato (1–3);
luego montar **staging** (4), que desbloquea lo de **mayor valor de seguridad** (5 y 6); después el
*rate-limiting* (7, depende de un servicio externo); y por último los **refactors grandes** (8–9), en sesiones
dedicadas.

---

## Detalle por ítem

### 1. M4 — Minimización de datos en la página pública de receta
- **Objetivo:** que `/prescriptions/view/[id]` **no revele el nombre de la clínica** (ni otros metadatos)
  cuando el código de verificación es incorrecto; mostrar un formulario neutro de "ingresa el código".
- **Enfoque:** en el branch de "código incorrecto" no cargar/mostrar el nombre de la clínica. Revisar también
  que `/verificar/[code]` siga mostrando un genérico ("documento no encontrado") sin metadatos.
- **Archivos:** `app/prescriptions/view/[id]/page.tsx`.
- **Riesgo:** bajo (UI de página pública). **Requiere:** solo código.
- **Verificación:** código incorrecto → sin nombre de clínica; código correcto → receta completa.

### 2. M5 — Firmar URLs de estudios bajo demanda (quitar N+1)
- **Objetivo:** dejar de generar una *signed URL* por cada estudio al cargar el expediente; firmar solo al
  hacer clic en "descargar".
- **Enfoque:** quitar `studiesWithSignedUrls` de `patients/[id]/page.tsx`; nueva *server action*
  `getStudySignedUrl(studyId)` que valida la clínica y devuelve la URL; el botón de descarga de `StudyList`
  la llama al hacer clic.
- **Archivos:** `app/dashboard/patients/[id]/page.tsx`, `app/dashboard/components/StudyList.tsx`,
  `app/dashboard/patients/actions.ts`.
- **Riesgo:** medio (cambia el flujo de descarga). **Requiere:** solo código.
- **Verificación:** expediente con muchos estudios carga rápido; clic en descargar abre el archivo.

### 3. M7 — Archivar la bitácora antes de borrar un tenant
- **Objetivo:** preservar `audit_logs` al borrar una clínica (hoy se borran en cascada) **sin romper** el
  borrado de tenants que ya existe.
- **Decisión tuya (elegir una):**
  - **(a) Archivar:** tabla `audit_logs_archive`; antes de `clinics.delete()` copiar ahí los logs de esa
    clínica, luego borrar.
  - **(b) Soft-delete del tenant:** marcar la clínica como inactiva/archivada en vez de borrarla (conserva
    todo, pero cambia el modelo de "borrado").
- **Enfoque (si (a)):** migración con la tabla de archivo + lógica en `superadmin/actions.ts` (en `deleteTenant`
  y, si aplica, en los rollbacks de `provisionTenant`).
- **Archivos:** `app/superadmin/actions.ts`, nueva migración.
- **Riesgo:** medio (toca borrado de tenants) → probar en staging idealmente. **Requiere:** SQL + código + tu decisión.

### 4. Infra — Entorno de staging + esquema versionado (cierra A2 del todo)
- **Objetivo:** un Supabase de **staging** (clon del esquema) + adoptar **Supabase CLI** para versionar TODO el
  DDL (funciones, triggers, RLS, índices). Habilita el test de RLS (#5) y probar M1 (#6) sin riesgo.
- **Enfoque:** crear proyecto Supabase de staging; `supabase db dump` del esquema → versionar en el repo; seed
  mínimo (2 clínicas + usuarios de prueba). Dejar de aplicar DDL a mano.
- **Requiere:** **acción tuya** (crear el proyecto staging y dar credenciales de prueba).
- **Riesgo:** ninguno en producción (entorno aparte).

### 5. A5 Fase 2 — Test automatizado de aislamiento multi-tenant (RLS)
- **Objetivo:** pruebas que confirmen que un usuario de la clínica A **no** puede leer/editar datos de la B, y
  que un anónimo no lee nada. Es la verificación de seguridad de **mayor valor**.
- **Enfoque:** contra el Supabase de **staging**, sembrar 2 clínicas/usuarios; con el JWT de cada usuario,
  asertar 0 filas / error en accesos cross-tenant (SELECT/UPDATE). Integrar en CI.
- **Archivos:** `tests/rls.integration.test.ts` + helpers de seed; variables de entorno de staging.
- **Requiere:** #4 (staging). **Riesgo:** ninguno (no toca prod).

### 6. M1 — Estandarizar las políticas RLS
- **Objetivo:** políticas explícitas por operación (`FOR SELECT/INSERT/UPDATE/DELETE` con `WITH CHECK`) en
  `lab_test_categories`, `lab_tests`, `lab_orders` y `locations`, igual que las tablas núcleo.
- **Enfoque:** migración `drop policy ... ; create policy ... (por operación)` con el **mismo predicado**;
  **probar primero en staging**. Para `locations`, exportar antes su política real (no está en el repo).
- **Archivos:** nueva migración.
- **Riesgo:** medio (RLS en prod) → por eso va **después** de tener staging. **No es una vulnerabilidad** (es robustez).

### 7. M8 (resto) — Rate-limiting en endpoints públicos
- **Objetivo:** limitar abuso/fuerza bruta en páginas públicas (verificar/vista) y el webhook. (El cron ya es
  *fail-closed* con secreto y el webhook ya valida HMAC.)
- **Enfoque:** rate-limiter compatible con serverless, p. ej. **Upstash Redis** + `@upstash/ratelimit` (o
  Vercel KV), por IP/código.
- **Requiere:** servicio externo (cuenta Upstash/Vercel KV) → **acción tuya**.
- **Riesgo:** bajo-medio (mal calibrado podría bloquear tráfico legítimo).

### 8. B1 — Partir componentes monolíticos + quitar duplicación
- **Objetivo:** dividir `PatientDetailsClient` (~2145 líneas), `AgendaClient`, `NewConsultationClient`,
  `ConfigClient`; unificar las pestañas duplicadas (`PatientHistoryTabs` vs las de `PatientDetailsClient`).
- **Enfoque:** **incremental**, un componente a la vez, con verificación funcional/visual (idealmente con la
  suite de tests ya creciendo). **No** hacerlo de golpe.
- **Riesgo:** alto de regresión → **sesiones dedicadas**.

### 9. B2 — Sistema de diseño (migrar estilos inline)
- **Objetivo:** mover estilos inline a clases utilitarias en `globals.css`.
- **Enfoque:** gradual, por pantalla. **Bajo valor, baja prioridad** (cosmético).
- **Riesgo:** regresiones visuales.

---

## Notas
- **Flujo por ítem (igual que hasta ahora):** rama desde `main` → `tsc` + `next build` + `npm test` en verde →
  commit → push (Vercel despliega). El SQL lo corres tú en Supabase. Marcar el avance en este archivo y en
  `auditoria_tecnica.md`.
- **Lo que necesita acción tuya antes de empezar:** crear el **Supabase de staging** (#4) — desbloquea #5 y #6;
  decidir **archivar vs soft-delete** para #7… (M7); y una cuenta de **Upstash/Vercel KV** para #7 (rate-limiting).
- **Lo aceptado (no se hará):** B3 (latencia marginal) y B4 (bucket de firmas público **por diseño**).
- **Recordatorio honesto:** completar todo esto **sube mucho** la postura de seguridad, pero ningún sistema es
  "100% seguro"; lo que más confianza real daría del multi-tenant es **#5 (test de aislamiento RLS)**.

# Auditoría Técnica de Seguridad y Arquitectura

> **Documento vivo.** Se actualiza a medida que se mitiga cada hallazgo (ver la columna **Estado** y la
> sección [Seguimiento de mitigación](#10-seguimiento-de-mitigación-documento-vivo)).

| Campo | Valor |
|---|---|
| Proyecto | Gestión Médica / CloudMedHN |
| Fecha de la auditoría | 2026-06-19 |
| Commit auditado | `f2f2f64` (rama `main`) |
| Stack real | Next.js 16 (App Router) · Supabase (PostgreSQL + Auth + Storage) · Vercel · CSS variables + estilos inline |
| Alcance | Código fuente y migraciones **del repositorio**. No incluye la base de datos viva (ver [Metodología y limitaciones](#11-metodología-y-limitaciones)). |
| Versión del documento | 1.0 |

---

## 1. Resumen ejecutivo

El sistema es un **SaaS médico multi-tenant** con una postura de seguridad **moderada-buena** para su etapa.
Los fundamentos correctos están presentes: RLS habilitado en todas las tablas del repo, verificación HMAC
*timing-safe* en el webhook de WhatsApp, escape de HTML en correos, uso del *query builder* (sin SQL crudo),
cliente service-role siempre detrás de un chequeo de autorización (salvo páginas públicas intencionales), y
`auth.getUser()` en el middleware (valida el JWT contra el servidor de Auth).

**No se identificaron vulnerabilidades de severidad _Crítica_ explotables de forma remota sin autenticación en
el código revisado.** Los hallazgos más relevantes son de severidad **Alta** y se concentran en cuatro temas:

1. **Códigos de verificación predecibles** (`Math.random()`) que son la única barrera de páginas públicas que
   exponen datos clínicos (PHI).
2. **Objetos de seguridad de la base de datos fuera del control de versiones** (funciones, triggers, índices),
   lo que impide reproducir y auditar el modelo de aislamiento multi-tenant.
3. **Escrituras multi-paso no atómicas** con errores silenciados (integridad de datos clínicos).
4. **RLS como único control de autorización** en varias *server actions* (sin defensa en profundidad) y
   **ausencia total de pruebas automatizadas**.

### Nota de alcance (discrepancia con el enunciado)

El encargo describía un **"ERP con facturación, inventario y planillas" sobre Tailwind**. La realidad del
código es distinta y conviene dejarlo registrado:

- **No existen** módulos de facturación, inventario ni planillas. Los módulos reales son: pacientes, consultas,
  recetas, **órdenes de laboratorio**, estudios médicos, citas/agenda, gestión de clínicas/tenants y superadmin.
- **No usa Tailwind**: usa **CSS variables + estilos inline**. Sí usa Next.js (App Router), Supabase y Vercel.
- En consecuencia, la "concurrencia de inventario/financiera" no aplica. El **equivalente crítico** en este
  dominio es la **integridad de las escrituras clínicas** (consulta + receta + PDF + orden de laboratorio).

---

## 2. Tabla resumen de hallazgos

| ID | Área | Severidad | Estado | Evidencia principal |
|----|------|-----------|--------|----------------------|
| A1 | Seguridad | 🔴 Alta | ✅ Mitigado | `app/dashboard/consultations/actions.ts` (gen. de `MC-`/`LAB-`) |
| A2 | BD / Auditoría | 🔴 Alta | ✅ Mitigado | `supabase/migrations/*` (5 funciones no versionadas) |
| A3 | Lógica de negocio | 🔴 Alta | ✅ Mitigado | `app/dashboard/consultations/actions.ts`, `app/superadmin/actions.ts` |
| A4 | Seguridad / Arquitectura | 🔴 Alta | ✅ Mitigado | `app/dashboard/patients/actions.ts`, `app/dashboard/actions.ts` |
| A5 | Calidad | 🔴 Alta | ✅ Mitigado (Fase 1) | Vitest + 28 pruebas unitarias; RLS (Fase 2) pendiente |
| M1 | BD / RLS | 🟠 Media | ⏸️ Diferido | `supabase/migrations/20260618010000_lab_orders.sql` |
| M2 | Validación | 🟠 Media | ✅ Mitigado | `app/dashboard/actions.ts`, `app/dashboard/consultations/actions.ts` |
| M3 | Seguridad | 🟠 Media | ✅ Mitigado | múltiples `actions.ts` (`error.message`) |
| M4 | Privacidad | 🟠 Media | ✅ Mitigado | `app/prescriptions/view/[id]/page.tsx` |
| M5 | Rendimiento | 🟠 Media | ✅ Mitigado | `app/dashboard/patients/[id]/page.tsx` |
| M6 | Validación / Datos | 🟠 Media | ✅ Mitigado | `app/api/whatsapp-webhook/route.ts` |
| M7 | BD / Auditoría | 🟠 Media | ⏸️ Diferido | `supabase/schema.sql` (FK `audit_logs`) |
| M8 | Operaciones | 🟠 Media | 🟡 Parcial | `.env.example`, endpoints `app/api/*` |
| B1 | Mantenibilidad | 🔵 Baja | ✅ Mitigado (Fase 1) | `PatientDetailsClient.tsx`, etc. |
| B2 | Mantenibilidad | 🔵 Baja | ⏸️ Diferido | estilos inline |
| B3 | Rendimiento | 🔵 Baja | ☑️ Aceptado | `app/superadmin/*` (RPC repetido) |
| B4 | Seguridad | 🔵 Baja | ☑️ Aceptado | bucket `signatures` público |
| B5 | Bug funcional | 🔵 Baja | ✅ Mitigado | `admin_platform_summary()` (nombres de bucket erróneos) |

Leyenda de Estado: **Pendiente** · **En curso** · **Mitigado** · **Aceptado (riesgo asumido)** · **No aplica**.

---

## 3. Hallazgos de severidad ALTA

### A1 — Códigos de verificación generados con `Math.random()` (predecibles)
- **Evidencia:** `app/dashboard/consultations/actions.ts` — `verificationCode = \`MC-${Math.random().toString(36).substring(2,11).toUpperCase()}\`` y `labVerificationCode = \`LAB-${Math.random()...}\``.
- **Riesgo:** estos códigos son la **única barrera de acceso** de páginas **públicas** servidas con el cliente
  *service-role* (`/verificar/[code]`, `/prescriptions/view/[id]`), que exponen PHI (paciente, médico,
  medicamentos, exámenes, incapacidad). `Math.random()` **no es criptográficamente seguro**: su estado es
  recuperable a partir de algunas salidas, y el espacio (~46 bits) es enumerable con esfuerzo. Un atacante
  podría predecir/derivar códigos válidos y leer documentos de cualquier clínica.
- **Recomendación:** generar el código con CSPRNG, p. ej. `crypto.randomUUID()` o
  `crypto.randomBytes(16).toString('base64url')`. (El backfill SQL ya usa `md5(gen_random_uuid())`, que es
  aceptable; el problema es la generación en tiempo de ejecución.) Considerar además TTL/expiración del código.
- **Estado:** ✅ **Mitigado (2026-06-19).** Nuevo helper `utils/verification-code.ts` con
  `crypto.randomBytes` (CSPRNG, ~51 bits); `createConsultation` ahora genera `MC-`/`LAB-` con él. Pendiente
  (opcional, no bloqueante): TTL/expiración del código.

### A2 — Objetos de seguridad de la BD fuera del control de versiones
- **Evidencia (corregida 2026-06-19):** verificación precisa de funciones definidas vs. referenciadas. Las
  funciones **referenciadas pero NO definidas en el repo** son **5**: `current_clinic_id()`,
  `is_platform_admin()`, `current_user_role()`, `is_org_admin_now()`, `admin_platform_summary()`. (Corrección
  sobre v1.0: `log_audit_event()` **sí** está versionado en `migrations/20260610020000_study_delete_ownership.sql`;
  también lo están `clinic_storage_bytes`, `admin_tenant_overview`, `enforce_user_limits`, `enforce_location_limits`,
  `set_is_pediatric`, `handle_new_user`, `log_patient_change`.) Además, los índices viven en `supabase/optimize.sql`
  (en git, pero aplicado a mano, fuera del flujo de migraciones).
- **Riesgo:** el corazón del aislamiento multi-tenant y del gating de superadmin son funciones
  `SECURITY DEFINER` **invisibles para el control de versiones**. No se pueden auditar, revisar en PR, ni
  recrear el entorno desde cero (DR). Un cambio incorrecto en esas funciones rompería el aislamiento sin dejar
  rastro en el repo.
- **Recomendación:** versionar las 5 funciones faltantes **verbatim** desde producción (no reconstruirlas a
  ciegas: un `create or replace` con un cuerpo distinto al real sobrescribiría la función de seguridad y podría
  romper el aislamiento). A futuro, exportar el esquema completo (`supabase db dump`) y adoptar migraciones
  versionadas (Supabase CLI) en lugar de DDL manual.
- **Estado:** ✅ **Mitigado (2026-06-19).** Las 5 funciones quedaron versionadas **verbatim** en
  `supabase/migrations/20260619000000_versioned_security_functions.sql` (idempotentes; coinciden con
  producción). Índices formalizados como migración (`migrations/20260619020000_indexes.sql`, 2026-06-19).
  Pendiente opcional: adoptar `supabase db dump` / CLI para el esquema completo. **Hallazgo nuevo derivado →
  B5** (bucket names erróneos en `admin_platform_summary`).

### A3 — Escrituras multi-paso no atómicas con errores silenciados
- **Evidencia:**
  - `app/dashboard/consultations/actions.ts` — `createConsultation` ejecutaba en secuencia: insertar consulta →
    insertar receta → generar PDF → subir a Storage → `update pdf_url` → notificar WhatsApp → insertar orden de
    laboratorio → marcar cita `COMPLETED`. Varios errores se registraban con `console.error` **sin `return`** y
    devolvía `success` aunque pasos hubieran fallado (fallo de receta continuaba; cita ignorada; `JSON.parse`
    de `lab_order` con catch silencioso) → **éxito silencioso con estado parcial**.
  - `app/superadmin/actions.ts` — `provisionTenant`. **Corrección 2026-06-19:** verificado que **SÍ tiene
    compensación/rollback** (borra `locations`+`clinics` si falla la creación del dueño, y ya devuelve `warning`
    si falla el email). La sub-auditoría exageró este punto; el único paso best-effort es la siembra del
    catálogo de laboratorio (aceptable: se puede recargar desde el admin).
- **Riesgo:** estados parciales en la consulta (consulta sin receta/PDF, cita no marcada) reportados como éxito,
  **sin feedback al médico**. En un sistema clínico, la integridad importa.
- **Recomendación (aplicada, opción b):** la consulta (nota clínica) es la fuente de verdad y se conserva; los
  pasos secundarios que fallen **acumulan avisos** que se devuelven al cliente y se muestran al médico, en vez
  de un `success` silencioso. WhatsApp aislado en su propio `try/catch` (best-effort, no afecta la receta).
  Mejora futura opcional (no bloqueante): mover el núcleo a una **RPC transaccional** para atomicidad real.
- **Estado:** ✅ **Mitigado (2026-06-19).** `createConsultation` ahora acumula `warnings[]` (receta, PDF,
  WhatsApp, orden de laboratorio, cita) y los devuelve; `NewConsultationClient.handleSubmit` los muestra al
  médico. `provisionTenant` ya compensaba (confirmado).

### A4 — RLS como único control de autorización en server actions (sin defensa en profundidad)
- **Evidencia:** `updatePatient`, `updatePatientGender` (`app/dashboard/patients/actions.ts`),
  `updateAppointmentStatus` (`app/dashboard/actions.ts`) hacen `update(...).eq('id', id)` **sin** revalidar
  `clinic_id`/rol en la aplicación.
- **Matiz verificado:** RLS **sí** aísla por clínica en estas operaciones (el `UPDATE ... USING (clinic_id =
  mi_clínica)` impide tocar filas de otra clínica). Por eso **no es una fuga cross-tenant directa**. El
  problema es la **ausencia de defensa en profundidad**: toda la autorización descansa en una sola capa (RLS).
  Una regresión o desactivación accidental de una política = fuga inmediata, sin red de seguridad en la app.
- **Riesgo:** punto único de falla para el control de acceso; además sin pruebas que detecten la regresión.
- **Recomendación:** añadir chequeos explícitos en las *server actions* sensibles (acotar el `UPDATE` con
  `.eq('clinic_id', ...)` del usuario y verificar filas afectadas), como segunda capa.
- **Estado:** ✅ **Mitigado (2026-06-19).** `updatePatient`, `updatePatientGender` y `updateAppointmentStatus`
  ahora exigen sesión, derivan `clinic_id` del servidor, **acotan el UPDATE con `.eq('clinic_id', ...)`** y
  verifican filas afectadas (devuelven "No tienes permiso…" si 0). Verificado que `updatePrescription` y
  `deleteMedicalStudy` **ya** tenían sesión + scope de clínica. Además `updateAppointmentStatus` ahora valida
  el **enum de estado** (avanza M2).

### A5 — Ausencia total de pruebas automatizadas
- **Evidencia:** no existen `*.test.*` / `*.spec.*` / `__tests__` en el repo.
- **Riesgo:** sin pruebas de autorización, validación de inputs ni de las políticas RLS, cualquier regresión
  (especialmente en aislamiento multi-tenant) pasa desapercibida. Es el multiplicador de riesgo de A2 y A4.
- **Recomendación:** suite mínima que cubra (a) aislamiento RLS, (b) validación de inputs, (c) lógica crítica.
- **Estado:** ✅ **Mitigado — Fase 1 (2026-06-19).** Se montó **Vitest** (`vitest.config.ts`, script `npm test`)
  y una suite de **28 pruebas unitarias** sobre la lógica crítica/pura: generación de códigos (A1), validación
  de signos vitales y enum de estado de cita (extraídos a `utils/validation.ts`), parseo de medicamentos,
  nombres de médico y edad/pediátrico. Corren en ~140 ms. **Fase 2 pendiente (follow-up, requiere BD de
  pruebas):** test de **aislamiento multi-tenant (RLS)** que verifique que un usuario de la clínica A no puede
  leer/editar datos de la B — necesita un proyecto Supabase de staging con credenciales y datos semilla.

---

## 4. Hallazgos de severidad MEDIA

### M1 — Inconsistencia en el estilo de políticas RLS (no es fuga; es robustez)
- **Evidencia:** las tablas nuevas `lab_test_categories`, `lab_tests`, `lab_orders`
  (`supabase/migrations/20260618010000_lab_orders.sql`) y `locations` usan `FOR ALL USING(...)` **sin**
  `WITH CHECK` explícito, mientras que las tablas núcleo se migraron a políticas **por operación** con
  `WITH CHECK` en `supabase/migrations/20260610030000_fix_rls_insert_policies.sql`.
- **Aclaración importante (corrige un falso positivo):** `FOR ALL USING(...)` **no permite escrituras
  cross-tenant**. PostgreSQL usa la expresión `USING` como `WITH CHECK` cuando esta se omite, por lo que un
  `INSERT`/`UPDATE` con un `clinic_id` ajeno es rechazado. (De hecho, el equipo documentó lo contrario —que
  bloqueaba inserts— en la migración `...030000`; hoy las órdenes de laboratorio se insertan correctamente, lo
  que confirma el *fallback*.) El hallazgo es de **consistencia/robustez**, no de vulnerabilidad.
- **Riesgo:** inconsistencia que dificulta el razonamiento y depende del comportamiento implícito del motor;
  frágil ante cambios de versión o si se reescriben políticas.
- **Recomendación:** estandarizar todas las tablas a políticas explícitas por operación
  (`FOR INSERT WITH CHECK`, `FOR SELECT/UPDATE/DELETE USING`), igual que las tablas núcleo.
- **Estado:** ⏸️ **Diferido (2026-06-19).** Es robustez/consistencia **sin** beneficio de seguridad (el
  *fallback* de Postgres ya protege contra escritura cross-tenant). Además, `locations` no tiene su política
  versionada en el repo (vive solo en la BD), así que reescribirla a ciegas es arriesgado. Dado que estamos en
  **producción** y el riesgo (romper RLS) supera al beneficio (cero), se difiere para hacerlo con un entorno de
  staging. No es una vulnerabilidad.

### M2 — Validación de inputs dispersa y faltante
- **Evidencia:** `updateAppointmentStatus` (`app/dashboard/actions.ts`) acepta cualquier string como `status`
  (sin validar el enum); `duration_minutes` se parsea sin cota; el `lab_order` se procesa con `JSON.parse` en
  un `try/catch` **silencioso** (si el JSON viene mal, la orden se descarta sin avisar al usuario).
- **Nota:** los **signos vitales sí** se validan por rango (corregido en una iteración previa) — buen patrón a
  replicar.
- **Riesgo:** integridad de datos (estados inválidos, valores absurdos) y pérdida silenciosa de la orden.
- **Recomendación:** validar el enum de estado; acotar numéricos; devolver error si `lab_order` es inválido;
  adoptar validación por esquema (p. ej. **zod**) compartida entre formularios y *server actions*.
- **Estado:** ✅ **Mitigado (2026-06-19).** Validación de **vitales** y **enum de estado** centralizada en
  `utils/validation.ts` (con tests); `createAppointment`/`updateAppointment` validan estado + **cota de
  `duration`** (5–480 min); `lab_order` inválido ahora avisa (A3). `updateAppointment` además se endureció con
  sesión + scope de clínica (como A4). Pendiente opcional (mayor): adoptar **zod** en formularios/actions.

### M3 — Fuga de detalle de errores de Supabase al cliente
- **Evidencia:** varias *server actions* devuelven `\`...: ${error.message}\`` (p. ej. crear cita, actualizar
  estado), exponiendo nombres de columnas/constraints de la BD.
- **Riesgo:** divulgación de estructura interna; ayuda al reconocimiento de un atacante.
- **Recomendación:** registrar el error detallado en servidor y devolver mensajes genéricos al cliente.
- **Estado:** ✅ **Mitigado (2026-06-19).** Nuevo helper `utils/errors.ts` (`safeErrorMessage`) que registra el
  detalle en servidor y devuelve un mensaje genérico; aplicado en los **14 sitios** que filtraban
  `error.message` (pacientes, citas, consultas, recetas, superadmin, provisioning).

### M4 — Minimización de datos en páginas públicas
- **Evidencia:** `app/prescriptions/view/[id]/page.tsx` carga por UUID y, con código incorrecto, **muestra el
  nombre de la clínica** en el formulario de ingreso de código.
- **Riesgo:** divulgación menor de metadatos. (El UUID no es enumerable, así que no hay IDOR por el id.)
- **Recomendación:** revisar qué datos se exponen antes de validar el código; mostrar lo mínimo.
- **Estado:** ✅ **Mitigado (2026-06-20).** Con código incorrecto/ausente, `/prescriptions/view/[id]` ya **no
  carga ni muestra el nombre de la clínica**; muestra un "Portal de Pacientes" neutro.

### M5 — Patrón N+1 al firmar URLs de Storage
- **Evidencia:** `app/dashboard/patients/[id]/page.tsx` genera *signed URLs* por fila (estudios y recetas).
- **Matiz:** está dentro de `Promise.all` (en paralelo), por lo que no es N+1 secuencial; aun así son **N
  llamadas a Storage por carga de página**, que crecen con el historial del paciente.
- **Riesgo:** latencia y consumo de cuota de Storage al escalar.
- **Recomendación:** firmar bajo demanda (al hacer clic) o paginar/limitar el historial cargado de una vez.
- **Estado:** ✅ **Mitigado (2026-06-20).** (1) Se eliminó el N+1 de **recetas** (era trabajo muerto). (2) El
  N+1 de **estudios** se resolvió: las URLs firmadas ahora se generan **bajo demanda** vía la *server action*
  `getStudySignedUrl` (al hacer clic en "Ver/Descargar"), no por cada fila al cargar. `patients/[id]/page.tsx`
  y `consultations/new/page.tsx` ya no firman en bucle.

### M6 — Auto-registro de pacientes por WhatsApp con nombre de IA sin validar
- **Evidencia:** `app/api/whatsapp-webhook/route.ts` crea pacientes usando el nombre extraído por Gemini del
  mensaje, sin validación de formato. (La verificación de firma HMAC del webhook **sí** es correcta y
  *timing-safe*.)
- **Riesgo:** calidad de datos / *prompt injection* → PII basura o registros maliciosos. (El *query builder*
  parametriza, así que no hay SQLi.)
- **Recomendación:** validar/normalizar el nombre (longitud, caracteres permitidos) y considerar marcar estos
  registros como "pendientes de revisión".
- **Estado:** ✅ **Mitigado (2026-06-19).** `sanitizeName` en `utils/validation.ts` (con tests): deja solo
  letras/acentos/espacios y `.'-`, colapsa espacios y limita a 60 chars; aplicado al auto-registro del webhook.

### M7 — `audit_logs` se borra en cascada con la clínica
- **Evidencia:** `supabase/schema.sql` — `audit_logs.clinic_id` con `ON DELETE CASCADE`.
- **Riesgo:** al eliminar un tenant se destruye su bitácora de auditoría (viola inmutabilidad/retención).
- **Recomendación (corregida 2026-06-19):** ~~`ON DELETE RESTRICT`~~ **NO** — al verificar se confirmó que
  **sí existe borrado de tenants** (`superadmin/actions.ts:351` + los rollbacks de `provisionTenant`), y
  `RESTRICT` **rompería esa función** en producción (no se podría borrar una clínica con bitácora). La opción
  correcta es **archivar/mover los `audit_logs` antes de borrar el tenant** (cambio de código en el borrado),
  no tocar el FK.
- **Estado:** ⏸️ **Diferido (2026-06-19).** No se cambia el FK (rompería el borrado de tenants). Pendiente:
  implementar el archivado de bitácora previo al borrado, como tarea de código separada.

### M8 — Higiene operativa
- **Evidencia:** `CRON_SECRET` (usado en `app/api/send-reminders/route.ts`) no está documentado en
  `.env.example`; no hay *rate-limiting* en los endpoints públicos; las migraciones/DDL se aplican a mano.
- **Riesgo:** despliegues mal configurados, abuso de endpoints (spam de recordatorios si se filtra el secreto),
  *drift* entre repo y BD. (El endpoint es *fail-closed* si falta el secreto, lo cual mitiga.)
- **Recomendación:** documentar todos los secretos en `.env.example`; añadir *rate-limiting*; versionar las
  migraciones.
- **Estado:** 🟡 **Parcial (2026-06-19).** Se documentaron los secretos faltantes en `.env.example`
  (`CRON_SECRET`, `WHATSAPP_APP_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) y se formalizaron los índices
  como migración (`migrations/20260619020000_indexes.sql`). Pendiente: **rate-limiting** en endpoints públicos
  (cambio mayor, se difiere) y adoptar Supabase CLI para todo el DDL.

---

## 5. Hallazgos de severidad BAJA

| ID | Hallazgo | Recomendación | Estado |
|----|----------|----------------|--------|
| B1 | Componentes monolíticos (`PatientDetailsClient` ~2145 líneas, `AgendaClient`, `NewConsultationClient`, `ConfigClient`) y duplicación (`PatientHistoryTabs` vs tabs de `PatientDetailsClient`). | Extraer subcomponentes; unificar las pestañas duplicadas. | ✅ **Mitigado (Fase 1)** — 2026-06-20. Extracciones con **paridad funcional absoluta** (solo estructura; sin tocar lógica, mutaciones ni estilos), una por una con `tsc --noEmit` verde: **B1.1** `LastValueRef` + `LabOrder*` ← NewConsultationClient; **B1.2** `LabCatalogCard` ← ConfigClient; **B1.3** `StatusDropdown` + `STATUS_CONFIG` ← AgendaClient (1123→1061); **B1.4/B1.5** `WhatsAppShareModal` compartido (dedup del modal duplicado: PatientHistoryTabs 988→840, PatientDetailsClient 2145→2000); **B1.5** `LabOrdersTab` ← PatientDetailsClient (→1913). Build + 33 tests verdes. Fase 2 pendiente: seguir adelgazando `PatientDetailsClient` (paneles `consultations`/`prescriptions`/`history`) y `AgendaClient` (formulario de cita). |
| B2 | Estilos inline en vez de un sistema de diseño. | Migrar gradualmente a clases utilitarias en `globals.css`. | ⏸️ Diferido — churn cosmético grande, bajo valor, riesgo de regresiones visuales. |
| B3 | `is_platform_admin()` se re-evalúa por RPC en cada acción de superadmin. | Aceptable; opcional cachear con TTL corto. | ☑️ Aceptado — latencia marginal (acciones de superadmin son raras); cachear auth tiene más riesgo que beneficio. |
| B4 | Bucket `signatures` público con rutas predecibles (`clinic_id/doctor_id/...`). | Baja sensibilidad (la firma va impresa); opcional bucket privado + URL firmada. | ☑️ Aceptado — **por diseño**: las páginas públicas (verificar/vista) renderizan la firma; un bucket privado las rompería. |
| B5 | `admin_platform_summary()` calcula `almacenamiento_bytes` sobre buckets inexistentes (`recetas`/`estudios`/`firmas`) en vez de los reales (`prescriptions`/`medical-studies`/`signatures`) → el total del panel superadmin siempre da **0**. (Detectado al versionar A2.) | Corregir los nombres de bucket en la función. | ✅ Mitigado — `migrations/20260619010000_fix_admin_platform_summary_buckets.sql` (correr el SQL en Supabase) |

---

## 6. Área 1 — Seguridad y vulnerabilidades

- **RLS (cliente/servidor):** habilitado en todas las tablas del repo; idiom multi-tenant
  `clinic_id = (select clinic_id from user_profiles where id = auth.uid())`. Tablas núcleo con políticas por
  operación (`WITH CHECK`); tablas nuevas con `FOR ALL USING` → **M1**. Funciones de contexto
  (`current_clinic_id()`, etc.) **no versionadas** → **A2**.
- **Rutas y middleware:** `middleware.ts` exige sesión para `/dashboard` y `/superadmin` (redirige a `/login`),
  usando `auth.getUser()` (valida el JWT). La autorización fina (rol/clínica) se delega a páginas y *actions*;
  varias *actions* no la re-chequean → **A4**.
- **Vectores:** **XSS** — bien mitigado (React escapa; `escapeHtml` en correos; `dangerouslySetInnerHTML` solo
  con CSS estático). **SQLi** — no hay SQL crudo; todo por *query builder* y RPC con parámetros. **Secretos** —
  correctamente fuera de `NEXT_PUBLIC_`; `.env*` en `.gitignore`. **Acceso público** — gating por código de
  verificación → **A1**, **M4**. **Webhook** — HMAC *timing-safe* correcto; auto-registro sin validar → **M6**.

## 7. Área 2 — Base de datos (Supabase/PostgreSQL)

- **Esquema/consultas:** modelo relacional correcto; FKs bien definidas (mayormente `CASCADE`, con `RESTRICT`
  en `doctor_id`). `audit_logs` en cascada con la clínica → **M7**.
- **Índices:** presentes para FKs y columnas de búsqueda frecuente en `supabase/optimize.sql` (clinic_id,
  patient_id, scheduled_at, nombre/teléfono, verification_code por UNIQUE). Riesgo: `optimize.sql` se aplica a
  mano y no toda la definición está versionada → **A2**.
- **N+1:** firmado de URLs por fila → **M5**.
- **Transacciones/concurrencia:** escrituras multi-paso sin atomicidad → **A3**. Chequeos *check-then-act* de
  cuotas (usuarios/almacenamiento) con ventana de carrera; el trigger `enforce_user_limits` mitiga el de
  usuarios, pero `count()` no es atómico con el `INSERT` (posible exceso bajo alta concurrencia).

## 8. Área 3 — Escalabilidad y rendimiento

- **Fetching Next.js:** Server Components para la carga inicial (bien); páginas dinámicas (`ƒ`) sin caché por
  diseño (datos sensibles). No hay revalidación agresiva ni *over-fetching* evidente salvo el N+1 de **M5** y
  la triple consulta de `/verificar` (recetas→consultas→órdenes) que podría ser un solo RPC.
- **Cuellos de botella al escalar:** historial del paciente cargado completo (sin paginar) + N firmas de URL;
  generación de PDF + subida + notificación en línea dentro de la *server action* (latencia y acoplamiento) →
  ver **A3**/**M5**.
- **Serverless/Vercel:** los clientes Supabase se crean por petición (sin *pooling* propio); para PostgREST es
  adecuado. Si en el futuro se usa conexión directa a Postgres, considerar el *pooler* (PgBouncer) de Supabase.

## 9. Área 4 — Lógica de negocio y mantenibilidad

- **Robustez de transacciones:** principal debilidad → **A3** (errores silenciados, sin rollback). No hay
  transacciones financieras/inventario (esos módulos no existen).
- **Estructura/mantenibilidad:** utilidades bien organizadas (`utils/supabase/*`, `auth-guard`, `permissions`,
  `email`, `doctorName`, `medicines`). Debilidades: componentes monolíticos y duplicación (**B1**), estilos
  inline (**B2**), validación dispersa sin esquema (**M2**), y **0 pruebas** (**A5**).

---

## 10. Seguimiento de mitigación (documento vivo)

> Actualizar **Estado**, **Fecha** y **Commit/Notas** conforme se resuelva cada hallazgo.

| ID | Hallazgo (resumen) | Severidad | Estado | Fecha mitigación | Commit / Notas |
|----|--------------------|-----------|--------|------------------|----------------|
| A1 | Códigos de verificación con `Math.random()` | Alta | ✅ Mitigado | 2026-06-19 | `utils/verification-code.ts` (CSPRNG `crypto.randomBytes`) |
| A2 | Objetos de BD fuera del control de versiones | Alta | ✅ Mitigado | 2026-06-19 | `migrations/20260619000000_versioned_security_functions.sql` (5 funciones verbatim) |
| A3 | Escrituras multi-paso no atómicas | Alta | ✅ Mitigado | 2026-06-19 | `warnings[]` en `createConsultation` + mostrados en cliente; `provisionTenant` ya compensaba |
| A4 | RLS como único control de autorización | Alta | ✅ Mitigado | 2026-06-19 | `.eq('clinic_id')` + verificación de filas en update{Patient,PatientGender,AppointmentStatus} |
| A5 | Sin pruebas automatizadas | Alta | ✅ Mitigado (Fase 1) | 2026-06-19 | Vitest + 28 tests (`tests/`, `npm test`). Fase 2 (RLS) pendiente: requiere BD de pruebas |
| M1 | Inconsistencia de políticas RLS (lab_*/locations) | Media | ⏸️ Diferido | 2026-06-19 | Sin vuln; evitar DDL de RLS en prod sin staging; `locations` no versionado |
| M2 | Validación de inputs faltante (enum/cotas/JSON) | Media | ✅ Mitigado | 2026-06-19 | enum + cota `duration` + `utils/validation.ts` con tests; zod queda opcional |
| M3 | Fuga de `error.message` al cliente | Media | ✅ Mitigado | 2026-06-19 | `utils/errors.ts` (`safeErrorMessage`) en 14 sitios |
| M4 | Minimización de datos en página pública | Media | ✅ Mitigado | 2026-06-20 | Sin nombre de clínica con código incorrecto |
| M5 | N+1 de signed URLs | Media | ✅ Mitigado | 2026-06-20 | Estudios firmados bajo demanda (`getStudySignedUrl`) |
| M6 | Auto-registro WhatsApp sin validar nombre | Media | ✅ Mitigado | 2026-06-19 | `sanitizeName` (con tests) aplicado al webhook |
| M7 | `audit_logs` ON DELETE CASCADE | Media | ⏸️ Diferido | 2026-06-19 | `RESTRICT` rompería el borrado de tenants (existe); requiere archivar logs antes de borrar |
| M8 | Higiene operativa (CRON_SECRET, rate-limit, DDL manual) | Media | 🟡 Parcial | 2026-06-19 | `.env.example` completo + índices versionados; falta rate-limiting |
| B1 | Componentes monolíticos / duplicación | Baja | ✅ Mitigado (Fase 1) | 2026-06-20 | 6 extracciones presentacionales con paridad absoluta; `WhatsAppShareModal` deduplica el modal repetido; tsc/build/33 tests verdes |
| B2 | Estilos inline | Baja | ⏸️ Diferido | 2026-06-19 | Churn cosmético, bajo valor |
| B3 | RPC `is_platform_admin` repetido | Baja | ☑️ Aceptado | 2026-06-19 | Latencia marginal; cachear auth = más riesgo |
| B4 | Bucket `signatures` público | Baja | ☑️ Aceptado | 2026-06-19 | Por diseño (páginas públicas lo renderizan) |
| B5 | `admin_platform_summary()` usa nombres de bucket inexistentes (total=0) | Baja | ✅ Mitigado | 2026-06-19 | `migrations/20260619010000_...` (correr SQL) |

---

## 11. Metodología y limitaciones

- **Qué se revisó:** código fuente del repositorio (App Router, *server actions*, API routes, utilidades) y los
  archivos `supabase/schema.sql`, `supabase/optimize.sql` y `supabase/migrations/*`. Análisis estático/manual
  asistido (lectura dirigida + búsqueda). Se **verificaron directamente** las afirmaciones más sensibles
  (`middleware.ts`, semántica de RLS `FOR ALL USING`, ausencia de chequeos en `updatePatient`/
  `updateAppointmentStatus`, ausencia de definiciones de funciones de contexto).
- **Qué NO se pudo auditar (limitación clave):** la **base de datos viva** en Supabase — es decir, las
  **políticas RLS realmente aplicadas**, las funciones `SECURITY DEFINER` (`current_clinic_id()`,
  `is_platform_admin()`, `log_audit_event()`), los triggers y los índices efectivos. Como buena parte del
  modelo de seguridad vive solo en la BD (ver **A2**), **la verdad de producción no es comprobable desde el
  repo**.
- **Recomendación de higiene nº 1:** exportar el esquema completo de Supabase al repositorio y adoptar
  migraciones versionadas (Supabase CLI), para que una próxima auditoría pueda revisar el 100 % del modelo de
  seguridad y para habilitar recuperación ante desastres.
- **Nota:** las severidades reflejan el contexto (SaaS médico multi-tenant, datos PHI) y fueron **calibradas**
  a partir de la verificación directa; en particular se corrigió a la baja la supuesta "escritura cross-tenant"
  por RLS (ver **M1**) y la "modificación cross-tenant" en *server actions* (ver **A4**), que RLS sí contiene.

---

*Fin del reporte v1.0 — 2026-06-19. Mantener este archivo actualizado conforme se mitiguen los hallazgos.*

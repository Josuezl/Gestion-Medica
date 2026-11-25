# Odontología y odontograma (fase 1) — plan de implementación

> **Para agentes:** este plan lo ejecuta **Codex** (worker de Orca) tarea por tarea; **Claude
> coordina y revisa** cada tarea antes de pasar a la siguiente (decisión de Josué, 2026-11-25).
> Los pasos usan casillas (`- [ ]`).

**Objetivo:** que los odontólogos de San Martín registren consultas dentales con odontograma
interactivo, compartiendo pacientes e historial con los médicos de la clínica.

**Arquitectura:** `consultations.tipo` (`MEDICA`/`DENTAL`) + tabla `odontogramas` (una foto JSON
por consulta dental). Guardado atómico por RPC `guardar_consulta_dental` detrás de la ruta fija
`/api/guardar/consulta-dental`. Permisos en RLS con `is_dentist_now()`. Odontograma en SVG propio.

**Stack:** Next.js 16.4.6 (App Router, ver `node_modules/next/dist/docs/` antes de escribir
código), React 19, Supabase (Postgres + RLS), Vitest (lógica pura), Playwright (E2E contra
Supabase local).

**Spec:** `docs/superpowers/specs/2026-11-25-odontologia-odontograma-design.md` (leerla completa).

## Restricciones globales

- Rama `feat/odontologia`. Nada de push a `main`; el merge lo aprueba Josué.
- SQL **solo aditivo**; nunca `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`, `db reset` contra
  nada que no sea la Supabase local (`127.0.0.1`). Reemplazar políticas RLS (`DROP POLICY` +
  `CREATE POLICY` en la misma migración) sí está permitido.
- Todo se prueba con `npm run dev` + Supabase local (`npm run db:local`). Nunca `npm run dev:nube`.
- La ruta `/api/guardar/consulta` y `utils/guardado/consulta.ts` no cambian de forma
  incompatible; las consultas médicas deben seguir guardándose igual.
- Numeración FDI. Permanentes 11–18, 21–28, 31–38, 41–48; temporales 51–55, 61–65, 71–75, 81–85.
- Caras: `V` (vestibular), `L` (lingual/palatino), `M` (mesial), `D` (distal), `O`
  (oclusal/incisal).
- Regiones: `S1`…`S6` (sextantes), `AS` (arcada superior), `AI` (arcada inferior).
- Hallazgos (códigos): `CARIES`, `OBTURACION`, `SELLANTE`, `CORONA`, `ENDODONCIA`,
  `EXTRACCION_INDICADA`, `AUSENTE`, `IMPLANTE`, `PUENTE`, `PROTESIS_REMOVIBLE`, `FRACTURA`,
  `MOVILIDAD`.
- Estado de cada marca: `PENDIENTE` (rojo `#dc2626`) o `REALIZADO` (azul `#2563eb`); los colores
  viven en un único mapa.
- Dentición por edad: < 6 años `TEMPORAL`, 6–12 `MIXTA`, ≥ 13 o sin fecha de nacimiento
  `PERMANENTE`; el odontólogo puede cambiarla.
- Textos de interfaz en español; etiqueta de tipo: **"Odontología"**.
- Cada tarea termina con `npm run lint`, `npm test` y `npx tsc --noEmit` en verde.

## Foco de revisión

1. **Pestaña abierta antes del despliegue** guardando una consulta médica: `tipo` toma
   `'MEDICA'` por defecto y nada cambia → prueba en Tarea 1 (insert sin `tipo`).
2. **Usuario no odontólogo que llama la ruta o la API de Supabase directo**: RLS rechaza y la
   pantalla muestra un error claro → pruebas RLS en Tarea 1 y en Tarea 4.
3. **JSON de odontograma manipulado** (pieza 99, cara `X`, hallazgo inventado): se rechaza en el
   servidor antes del RPC → pruebas en Tarea 2.
4. **Cambiar de dentición a mitad de edición** (mixta → permanente): las marcas de piezas
   ocultas se conservan en el estado, no se borran → prueba en Tarea 2.
5. **Paciente sin fecha de nacimiento**: dentición `PERMANENTE`, sin error → prueba en Tarea 2.

---

### Tarea 1: Migración SQL + verificación RLS en local

**Archivos:**
- Crear: `supabase/migrations/20261125000000_odontologia.sql`
- Crear: `scripts/probar-rls-odontologia.mjs`
- Modificar: `supabase/schema.sql` solo si el repo lo regenera por convención (revisar README).

**Produce:**
- `user_profiles.is_dentist boolean not null default false`
- `public.is_dentist_now() returns boolean` (SQL, `STABLE SECURITY DEFINER`, `search_path public`,
  igual que `is_org_admin_now`): `coalesce((select is_dentist from user_profiles where id = auth.uid()), false)`.
- `guard_user_profile_changes()` reescrita (`CREATE OR REPLACE`) agregando
  `OR NEW.is_dentist IS DISTINCT FROM OLD.is_dentist` a la condición.
- `consultations.tipo text not null default 'MEDICA'` con
  `check (tipo in ('MEDICA','DENTAL'))`; columnas nulas `intraoral_exam text`,
  `procedures_done text`.
- Tabla `public.odontogramas`: `id uuid pk default gen_random_uuid()`, `clinic_id uuid not null`
  FK `clinics`, `patient_id uuid not null` FK `patients`, `consultation_id uuid not null unique`
  FK `consultations on delete cascade`, `doctor_id uuid not null` FK `user_profiles`,
  `denticion text not null check (denticion in ('PERMANENTE','TEMPORAL','MIXTA'))`,
  `estado jsonb not null`, `created_at timestamptz default now()`. Índice
  `(patient_id, created_at desc)`. RLS habilitada. Trigger `trg_audit_odontogramas` con
  `audit_row()`.
- Políticas `odontogramas`: `select` por `clinic_id = current_clinic_id()`; `insert` y `update`
  con `clinic_id = current_clinic_id() and is_dentist_now()`; sin `delete`.
- Políticas `consultations_insert`/`consultations_update` reemplazadas: condición actual de
  clínica **y** `(tipo <> 'DENTAL' or is_dentist_now())`. `consultations_delete`: condición
  actual **y** `(tipo <> 'DENTAL' or is_dentist_now() or is_org_admin_now())`.
- RPC `public.guardar_consulta_dental(p_patient_id uuid, p_appointment_id uuid, p_reason text,
  p_intraoral_exam text, p_diagnosis text, p_procedures_done text, p_treatment_plan text,
  p_denticion text, p_estado jsonb) returns uuid` — `SECURITY INVOKER` (RLS aplica), una
  transacción: inserta `consultations` (`tipo='DENTAL'`, `clinic_id=current_clinic_id()`,
  `doctor_id=auth.uid()`), inserta `odontogramas`, y si `p_appointment_id` no es nulo marca la
  cita `COMPLETED` (como `utils/guardado/consulta.ts:349`). Devuelve el id de la consulta.
  `GRANT EXECUTE` a `authenticated`.

- [ ] **Paso 1:** Escribir `scripts/probar-rls-odontologia.mjs`: usa supabase-js con
  `supabase status -o env` (reusar `statusSupabaseLocal` de `e2e/entorno.ts`), aborta si la URL
  no es `127.0.0.1`/`localhost`, crea con service role un odontólogo y un médico de la misma
  clínica y un usuario de otra clínica, y afirma:
  - médico: `rpc('guardar_consulta_dental')` → error; `insert` en `consultations` con
    `tipo:'DENTAL'` → error; insert sin `tipo` → ok y la fila queda `MEDICA`;
  - odontólogo: RPC → devuelve uuid, existe 1 fila en `odontogramas` con ese `consultation_id`;
  - médico: `select` de esa consulta y su odontograma → ok;
  - otra clínica: `select` → 0 filas;
  - médico: `update user_profiles set is_dentist=true` sobre sí mismo → error.
  Imprime `OK` o falla con código ≠ 0.
- [ ] **Paso 2:** `npm run db:local && node scripts/probar-rls-odontologia.mjs` → falla
  (columna/función inexistente).
- [ ] **Paso 3:** Escribir la migración.
- [ ] **Paso 4:** `npx supabase migration up` (local) y repetir el script → `OK`. Verificar
  también que `npm run test:e2e -- e2e/consulta-diseno.spec.ts` sigue verde (consulta médica).
- [ ] **Paso 5:** Commit `feat(odontologia): migración is_dentist, tipo de consulta, odontogramas y RPC`.

### Tarea 1b: Licencia de odontología por clínica

**Archivos:**
- Crear: `supabase/migrations/20261125000001_odontologia_licencia.sql` (aditiva; la de la Tarea 1 no se toca)
- Modificar: `scripts/probar-rls-odontologia.mjs`
- Modificar: `utils/auth-guard.ts` (`AuthProfile.clinics` + `odontologia_habilitada`; `AuthContext.odontologiaHabilitada: boolean`)
- Modificar: `app/superadmin/page.tsx`, `app/superadmin/actions.ts`, `app/superadmin/SuperAdminClient.tsx` (switch "Odontología" por clínica, mismo patrón que los topes `max_*_override`)

**Produce:**
- `clinics.odontologia_habilitada boolean not null default false`.
- `guard_clinic_changes()` (`CREATE OR REPLACE`) protege también `odontologia_habilitada` (solo `service_role`).
- `public.odontologia_habilitada_now() returns boolean` (`STABLE SECURITY DEFINER`, `search_path public`): licencia de la clínica de `auth.uid()`, `false` si no hay.
- `is_dentist_now()` (`CREATE OR REPLACE`) = marca del usuario **y** `odontologia_habilitada_now()`. Así todas las políticas y el RPC de la Tarea 1 quedan condicionados a la licencia sin reescribirlos.
- `AuthContext.odontologiaHabilitada` y `AuthContext.isDentist` = marca **y** licencia (las Tareas 4–8 usan estos dos valores para mostrar u ocultar).

- [ ] **Paso 1:** Extender el script: la clínica de prueba arranca con la licencia apagada → el odontólogo recibe error en el RPC; con service role se enciende → el RPC funciona; el org-admin de la clínica intenta encenderla con su sesión → error.
- [ ] **Paso 2:** Correr el script → FAIL. Escribir la migración, `npx supabase migration up --local`, script → OK.
- [ ] **Paso 3:** Superadmin: switch por clínica que llama a una acción con cliente de service role (igual que los topes). Manual local: encender/apagar y ver el cambio.
- [ ] **Paso 4:** `npm run lint`, `npm test`, `npx tsc --noEmit` en verde. Commit `feat(odontologia): licencia de odontología por clínica`.

### Tarea 2: Modelo del odontograma (lógica pura)

**Archivos:**
- Crear: `utils/odontograma.ts`
- Test: `tests/odontograma.test.ts`

**Produce (exportado desde `utils/odontograma.ts`):**
- Tipos: `Cara = 'V'|'L'|'M'|'D'|'O'`, `Region = 'S1'|…|'S6'|'AS'|'AI'`,
  `Hallazgo` (los 12 códigos), `EstadoMarca = 'PENDIENTE'|'REALIZADO'`,
  `Marca = { hallazgo: Hallazgo; estado: EstadoMarca }`,
  `Pieza = { caras?: Partial<Record<Cara, Marca>>; pieza?: Marca; nota?: string }`,
  `Denticion = 'PERMANENTE'|'TEMPORAL'|'MIXTA'`,
  `EstadoOdontograma = { version: 1; piezas: Record<string, Pieza>; regiones: Partial<Record<Region, Marca & { nota?: string }>> }`.
- `PIEZAS_PERMANENTES: number[]`, `PIEZAS_TEMPORALES: number[]` (orden de dibujo: superior
  derecha→izquierda del paciente 18…11, 21…28; inferior 48…41, 31…38; ídem temporales).
- `piezasDe(d: Denticion): number[]` (MIXTA = ambas).
- `denticionPorEdad(birthDate: string | null, hoy?: Date): Denticion`.
- `estadoVacio(): EstadoOdontograma`.
- `validarEstado(x: unknown): { ok: true; estado: EstadoOdontograma } | { ok: false; error: string }`.
- `HALLAZGOS: { codigo: Hallazgo; etiqueta: string; niveles: ('cara' | 'pieza' | 'region')[] }[]`
  (`CARIES`, `OBTURACION`, `SELLANTE`, `FRACTURA` → `['cara']`; `PUENTE`, `PROTESIS_REMOVIBLE` →
  `['pieza','region']`; el resto → `['pieza']`). `validarEstado` exige que cada marca esté en
  un nivel permitido para su hallazgo.
- `COLOR_ESTADO: Record<EstadoMarca, string>`.

- [ ] **Paso 1:** Tests:
  - `denticionPorEdad('2022-01-01', new Date('2026-11-25'))` → `'TEMPORAL'`; `'2017-06-01'` →
    `'MIXTA'`; `'2010-01-01'` → `'PERMANENTE'`; `null` → `'PERMANENTE'`.
  - `piezasDe('PERMANENTE').length === 32`, `piezasDe('TEMPORAL').length === 20`,
    `piezasDe('MIXTA').length === 52`.
  - `validarEstado(estadoVacio()).ok === true`.
  - Rechaza: pieza `'99'`, cara `'X'`, hallazgo `'INVENTADO'`, estado `'HECHO'`, `version: 2`,
    región `'S7'`, nota > 500 caracteres, no-objeto → `ok:false` con `error` no vacío.
  - Acepta un estado con marcas en `'55'` aunque la dentición actual sea `PERMANENTE`
    (conservar marcas ocultas al cambiar dentición).
- [ ] **Paso 2:** `npx vitest run tests/odontograma.test.ts` → FAIL.
- [ ] **Paso 3:** Implementar.
- [ ] **Paso 4:** → PASS.
- [ ] **Paso 5:** Commit `feat(odontologia): modelo y validación del odontograma`.

### Tarea 3: Componente `Odontograma` (SVG)

**Archivos:**
- Crear: `app/dashboard/odontologia/components/Odontograma.tsx` (`'use client'`)
- Crear: `app/dashboard/odontologia/components/dientes.ts` (siluetas SVG por tipo de pieza:
  molar, premolar, canino, incisivo; superior/inferior por espejo)

**Consume:** Tarea 2.
**Produce:** `<Odontograma estado={EstadoOdontograma} denticion={Denticion}
onChange?={(e: EstadoOdontograma) => void} onDenticionChange?={(d: Denticion) => void}
soloLectura?: boolean />`. Sin `onChange` o con `soloLectura` no hay interacción.

- [ ] **Paso 1:** Diseño según la imagen de referencia de la spec: fila superior de siluetas,
  fila de círculos de 5 caras con número FDI, ídem inferior, y debajo los 6 sextantes y 2
  arcadas como botones. Clic en cara/pieza/región abre un selector de hallazgo + estado
  (Pendiente/Realizado) + "Quitar". Marcas de pieza se dibujan sobre la silueta (p. ej.
  `AUSENTE` = X, `CORONA` = contorno, `ENDODONCIA` = línea en raíz, `PROTESIS_REMOVIBLE` =
  "PR"); de cara, rellenando el sector del círculo. Selector de dentición visible solo si es
  editable. Responsive: en teléfono, scroll horizontal dentro del componente, no de la página.
  Accesible: cada cara/pieza es `<button>` con `aria-label` "Pieza 36, cara oclusal".
- [ ] **Paso 2:** `npx tsc --noEmit` y `npm run lint` verdes. (No se crea página de prueba; la
  verificación visual se hace en la pantalla real de la Tarea 6.)
- [ ] **Paso 3:** Commit `feat(odontologia): componente odontograma SVG`.

### Tarea 4: Marca "Es odontólogo" y permisos en la app

**Archivos:**
- Modificar: `utils/auth-guard.ts` (`AuthProfile.is_dentist: boolean | null`,
  `AuthContext.isDentist: boolean`)
- Modificar: `utils/permissions.ts` (+ `puedeGuardarDental(ctx: { isDentist: boolean }): boolean`)
- Modificar: `app/dashboard/config/actions.ts` (`TeamMemberUpdate.isDentist?: boolean`; solo el
  org-admin lo escribe en `updateTeamMember`, y en `sendInvitation` si viene)
- Modificar: `app/dashboard/config/ConfigClient.tsx` (casilla "Es odontólogo" visible solo para
  rol `DOCTOR`)
- Test: `tests/permissions.test.ts`

- [ ] **Paso 1:** Test: `puedeGuardarDental({ isDentist: true })` → `true`; `false` → `false`.
- [ ] **Paso 2:** FAIL → implementar → PASS.
- [ ] **Paso 3:** Manual local: como admin, marcar a un médico como odontólogo, recargar, ver la
  casilla persistida; como médico no admin, intentar lo mismo vía consola → error del trigger.
- [ ] **Paso 4:** Commit `feat(odontologia): marca Es odontólogo en el perfil`.

### Tarea 5: Guardado de la consulta dental

**Archivos:**
- Modificar: `utils/camposGuardado.ts` (+ `leerParametrosConsultaDental`)
- Crear: `utils/guardado/consulta-dental.ts`
- Crear: `app/api/guardar/consulta-dental/route.ts` (mismo patrón que
  `app/api/guardar/consulta/route.ts`, comentario "Dirección fija: no renombrar")
- Test: `tests/camposGuardado.test.ts`

**Consume:** RPC (T1), `validarEstado`/`Denticion` (T2), `isDentist` (T4).
**Produce:**
- `leerParametrosConsultaDental(fd: FormData): { patientId: string; appointmentId: string | null;
  medicines: Medicine[]; denticion: Denticion; estado: EstadoOdontograma } | { error: string }`
  — lee `_patientId`, `_appointmentId`, `_medicines`, `_denticion`, `_odontograma` (JSON).
- `guardarConsultaDental(p, fd): Promise<{ success: true; consultationId: string; warnings?: string[] } | { error: string }>`:
  1. `getAuthContext()`; si `!isDentist` → `{ error: 'Solo los odontólogos pueden guardar consultas dentales.' }`.
  2. Requeridos: `reason_for_visit`, `diagnosis`, `treatment_plan` (mismos mensajes que la
     consulta médica). Opcionales: `intraoral_exam`, `procedures_done`.
  3. `supabase.rpc('guardar_consulta_dental', …)`; error → `safeErrorMessage(...)`.
  4. Si hay `medicines`, insertar receta igual que `utils/guardado/consulta.ts` (extraer esa
     parte a una función compartida `insertarReceta(supabase, {...})` dentro de
     `utils/guardado/receta.ts` **sin cambiar el comportamiento** de la consulta médica);
     fallo de receta → `warnings`, no borra la consulta.
  5. `revalidatePath` del paciente y `/dashboard`.

- [ ] **Paso 1:** Tests de `leerParametrosConsultaDental`: sin `_patientId` → error; `_odontograma`
  no-JSON → error; `_odontograma` con pieza `'99'` → error; `_denticion` `'OTRA'` → error;
  completo → objeto con `estado.version === 1`.
- [ ] **Paso 2:** FAIL → implementar → PASS. `npm test` completo verde (las pruebas existentes de
  la consulta médica siguen pasando tras extraer `insertarReceta`).
- [ ] **Paso 3:** Commit `feat(odontologia): guardado de consulta dental por ruta fija`.

### Tarea 6: Pantalla "Nueva consulta dental"

**Archivos:**
- Crear: `app/dashboard/odontologia/consulta/nueva/page.tsx` (servidor: `?patientId=&appointmentId=`;
  si `!isDentist` → redirige a la ficha del paciente)
- Crear: `app/dashboard/odontologia/consulta/nueva/NuevaConsultaDentalClient.tsx`

**Consume:** T3, T5. Reutilizar de `app/dashboard/consultations/new/`: los modales de historial
(`HistorySummaryModals`), el bloque de receta y `useFormDraft`, importándolos sin modificar su
comportamiento.

- [ ] **Paso 1:** Servidor carga: paciente (`select('*')`), último `odontogramas` del paciente
  (`order created_at desc limit 1`; si no hay → `estadoVacio()` y `denticionPorEdad`), y todas
  las consultas del paciente (médicas y dentales) para el historial.
- [ ] **Paso 2:** Cliente: campos Motivo, Examen intraoral/hallazgos, Odontograma (editable,
  precargado), Diagnóstico, Procedimientos realizados, Plan e indicaciones, Receta. Alergias y
  antecedentes del paciente visibles arriba. Historial lateral con etiqueta "Odontología" en
  las dentales. Envía con `guardarEnApi('/api/guardar/consulta-dental', fd)`; borrador local con
  `useFormDraft` (incluye el odontograma).
- [ ] **Paso 3:** Manual local como odontólogo: crear consulta con 3 marcas (cara, pieza, región),
  guardar, volver a abrir "Nueva consulta dental" → el odontograma viene precargado.
- [ ] **Paso 4:** Commit `feat(odontologia): pantalla de nueva consulta dental`.

### Tarea 7: Navegación, ficha del paciente y agenda

**Archivos:**
- Crear: `utils/rutaConsulta.ts` — `rutaNuevaConsulta(patientId: string, appointmentId: string | null, esOdontologo: boolean): string`
- Test: `tests/rutaConsulta.test.ts`
- Crear: `app/dashboard/odontologia/page.tsx` (consultas dentales recientes de la clínica +
  buscador de pacientes que enlaza a la ficha)
- Crear: `app/dashboard/odontologia/OdontogramaTab.tsx` (estado actual + selector de fechas
  anteriores, solo lectura; botón "Nueva consulta dental" si `isDentist`)
- Modificar: `app/dashboard/layout.tsx` (enlace "Odontología" para todo el personal, icono
  lucide `Smile`), `app/dashboard/patients/[id]/page.tsx` y `PatientDetailsClient.tsx` (pestaña
  `'odontograma'`, visible para todos), `app/dashboard/components/AppointmentCard.tsx:103` y
  `app/dashboard/AgendaClient.tsx:1509` (usar `rutaNuevaConsulta` con `is_dentist` del médico de
  la cita, cargado con el join `user_profiles(is_dentist)` en la consulta de citas).

- [ ] **Paso 1:** Tests: `rutaNuevaConsulta('p1', null, false)` →
  `'/dashboard/consultations/new?patientId=p1'`; `('p1','a1',false)` → `…&appointmentId=a1`;
  `('p1','a1',true)` → `'/dashboard/odontologia/consulta/nueva?patientId=p1&appointmentId=a1'`.
- [ ] **Paso 2:** FAIL → implementar → PASS; luego las pantallas.
- [ ] **Paso 3:** Manual local: cita con odontólogo → abre consulta dental; cita con médico →
  abre consulta médica; asistente ve la pestaña Odontograma sin botón de nueva consulta.
- [ ] **Paso 4:** Commit `feat(odontologia): sección, pestaña de odontograma y ruta por agenda`.

### Tarea 8: Historial unificado, etiquetas e impresión

**Archivos:**
- Crear: `utils/tipoConsulta.ts` — `etiquetaTipoConsulta(tipo: string | null | undefined): 'Odontología' | null`
  (`'DENTAL'` → `'Odontología'`; cualquier otro, incluido `undefined` → `null`).
- Test: `tests/tipoConsulta.test.ts`
- Modificar: lista `app/dashboard/consultations/page.tsx`, historial en
  `app/dashboard/consultations/new/` y en `PatientDetailsClient.tsx`: mostrar la etiqueta, signos
  vacíos como "—", y para `DENTAL` mostrar Examen intraoral y Procedimientos + enlace
  "Ver odontograma".
- Modificar: `app/consultations/[id]/print/page.tsx`: si `tipo === 'DENTAL'`, imprimir
  Odontograma (solo lectura) y campos dentales en lugar de signos vitales.
- Revisar `/verificar/[code]` y `app/dashboard/patients/[id]/email-actions.ts`: que una consulta
  dental no rompa (campos nulos) y lleve la etiqueta donde se muestra el tipo.

- [ ] **Paso 1:** Tests de `etiquetaTipoConsulta`. FAIL → implementar → PASS.
- [ ] **Paso 2:** Pantallas. Manual local: imprimir una consulta dental y una médica; la médica
  idéntica a antes.
- [ ] **Paso 3:** Commit `feat(odontologia): historial unificado e impresión dental`.

### Tarea 8b: Plan de trabajo imprimible (sin precios)

**Archivos:**
- Modificar: `utils/odontograma.ts` (+ `trabajosPendientes(estado: EstadoOdontograma): { ubicacion: string; hallazgo: Hallazgo; etiqueta: string; nota?: string }[]`)
- Test: `tests/odontograma.test.ts`
- Crear: `app/consultations/[id]/print/plan-trabajo/page.tsx` (reusa el encabezado de la
  clínica/médico y `PrintControlBar` de la impresión actual)
- Modificar: pantalla de consulta dental guardada / `OdontogramaTab.tsx`: botón
  "Imprimir plan de trabajo" (visible para todo el personal; solo lectura).

- [ ] **Paso 1:** Tests de `trabajosPendientes`: solo devuelve marcas `PENDIENTE` (ignora
  `REALIZADO`); orden FDI ascendente de piezas (11, 12 … 48, luego 51 … 85) y después las
  regiones `S1…S6, AS, AI`; `ubicacion` con el formato `'Pieza 36 · Oclusal'`, `'Pieza 21'` o
  `'Sextante 2'` / `'Arcada superior'`; estado vacío → `[]`.
- [ ] **Paso 2:** FAIL → implementar → PASS.
- [ ] **Paso 3:** Página: título "Plan de trabajo", paciente, fecha, odontólogo, odontograma
  (solo lectura), tabla de pendientes (Ubicación · Trabajo · Nota), diagnóstico e indicaciones
  de la consulta, firma. Sin columna de precio. Manual local: imprimir y revisar en una hoja.
- [ ] **Paso 4:** Commit `feat(odontologia): plan de trabajo imprimible`.

### Tarea 9: E2E y prueba con Josué

**Archivos:**
- Modificar: `e2e/entorno.ts` (`USUARIOS_E2E.odontologo = 'odontologo@e2e.test'`),
  `e2e/global-setup.ts` (crearlo como `DOCTOR` con `is_dentist = true`), `e2e/fixtures.ts`
  (`comoOdontologo`).
- Crear: `e2e/odontologia.spec.ts`.

- [ ] **Paso 1:** Escenarios:
  - odontólogo crea consulta dental con marca `CARIES` pendiente en pieza 36 cara `O` → aparece
    en la ficha con etiqueta "Odontología";
  - médico abre nueva consulta médica del mismo paciente → ve la dental en el historial y el
    odontograma en solo lectura, sin botón "Nueva consulta dental";
  - médico hace `POST /api/guardar/consulta-dental` directo → respuesta con `error`;
  - consulta médica normal sigue guardándose (reusar flujo de `consulta-diseno.spec.ts`).
- [ ] **Paso 2:** `npm run test:e2e` completo → verde (escritorio y teléfono).
- [ ] **Paso 3:** Commit `test(odontologia): e2e de consulta dental y permisos`.
- [ ] **Paso 4:** **Prueba manual con Josué en local** (`npm run dev`). Sin su visto bueno no se
  abre PR.
- [ ] **Paso 5:** PR a `main` con la lista de despliegue de `docs/despliegue-sin-errores.md`
  (SQL de la Tarea 1 en producción antes del merge; merge con aprobación de Josué).

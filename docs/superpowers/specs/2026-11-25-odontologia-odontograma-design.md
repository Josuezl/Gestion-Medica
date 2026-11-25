# Odontología y odontograma — diseño

Fecha: 2026-11-25 · Estado: borrador para aprobación de Josué

## Intención

Clínica Médica San Martín (ya en producción) suma un área de odontología: mismo dueño, misma
sede, dos odontólogos nuevos. Necesitan registrar consultas dentales con un **odontograma**
interactivo y compartir pacientes e historial con los médicos de la clínica.

## Decisiones de Josué

- Es **la misma clínica (tenant) y la misma sede**. No se crea clínica ni `location` nueva.
- Se agregan **dos licencias de médico** a San Martín subiendo `clinics.max_doctors_override`
  desde superadmin, sin código nuevo.
- Los odontólogos se identifican con una **marca explícita "Es odontólogo"** en el perfil (no se
  usa el texto libre de `specialty`). La activa el administrador de la clínica.
- **Ver:** todo el personal de la clínica ve el odontograma y las consultas dentales (solo
  lectura). **Guardar:** solo los odontólogos.
- **El historial es compartido en ambos sentidos**: al abrir una consulta, un médico ve las
  consultas dentales previas y un odontólogo ve las médicas.
- **El plan de tratamiento con costos y el presupuesto quedan para la fase 2.** La fase 1 debe
  permitir agregarlos sin rehacer nada.
- **Enfoque A**: la consulta dental vive en `consultations`, en una columna `tipo`, y el
  odontograma en una tabla aparte.
- **Los odontólogos conservan todo lo que puede hacer un médico** (consulta médica, incapacidad,
  órdenes de laboratorio, estudios). No se les restringe nada. La única diferencia es que
  además pueden guardar consultas dentales y odontogramas.
- **Plan de trabajo imprimible (añadido al aprobar el plan):** el odontólogo imprime un
  documento con el odontograma marcado, la lista de trabajos pendientes por pieza (marcas
  `PENDIENTE`, en orden FDI, con cara, hallazgo y nota), y el diagnóstico y las indicaciones de
  la consulta. **No lleva precios**: los costos siguen en la fase 2.
- **Licencia de odontología por clínica (añadido 2026-11-25):** el módulo se vende aparte.
  Columna `clinics.odontologia_habilitada boolean not null default false`, que solo el superadmin
  cambia (protegida en `guard_clinic_changes`, igual que `plan_code`). Si está apagada, la clínica
  no ve el menú "Odontología", ni la pestaña de odontograma, ni la casilla "Es odontólogo", y la
  base rechaza guardar datos dentales (`is_dentist_now()` también exige la licencia). San Martín
  se enciende desde superadmin al desplegar; las demás clínicas quedan apagadas.
- **Forma de trabajo:** Codex programa, Claude coordina y revisa. **Todo se prueba en local**
  (`npm run dev` con Supabase local) antes de subir a producción.

## Objetivos (fase 1)

1. Marca "Es odontólogo" en el perfil, editable por el administrador de la clínica.
2. Consulta dental: motivo, examen intraoral/hallazgos, diagnóstico, procedimientos realizados,
   plan e indicaciones, receta (reutilizando el flujo actual) e impresión.
3. Odontograma interactivo con historial: una "foto" por consulta dental, y cada consulta nueva
   parte del último estado guardado.
4. Sección "Odontología" en el menú, con sus puntos de entrada en la ficha del paciente.
5. Historial unificado: las consultas dentales aparecen en la línea de tiempo del paciente y en
   la pantalla de nueva consulta médica, marcadas como "Odontología".
6. Permisos aplicados **en la base de datos (RLS)**, no solo en la interfaz.

## No objetivos (fase 1)

- Plan de tratamiento, precios, presupuesto y catálogo de procedimientos con costo (fase 2).
- Periodontograma (bolsas, sangrado, movilidad).
- Imágenes o radiografías dentro del odontograma. Se pueden subir como estudios con lo que ya
  existe.
- Cambios para otras clínicas: la marca vale para cualquier tenant, pero solo se activa en San
  Martín.

## Anti-objetivos (sería un fracaso aunque funcione)

- Romper o hacer más lento el flujo de consulta médica que San Martín usa a diario.
- Que un usuario que no es odontólogo pueda guardar datos dentales saltándose la interfaz.
- Que una pestaña abierta antes del despliegue pierda lo que estaba guardando (ver
  `docs/despliegue-sin-errores.md`).
- Mezclar el historial: que no se distinga qué consulta fue médica y cuál dental.

## Restricciones

- **SQL solo aditivo** y aplicado antes del push. Nada se renombra ni se quita
  (`docs/despliegue-sin-errores.md`).
- Un formulario nuevo e importante **nace con ruta fija `/api/guardar/...`**, no con Server
  Action.
- La ruta `/api/guardar/consulta` existente **no cambia de forma incompatible**.
- Next.js de este repo tiene cambios incompatibles: hay que leer `node_modules/next/dist/docs/`
  antes de escribir código (AGENTS.md).
- `guard_user_profile_changes` debe proteger la nueva marca igual que `role`/`is_org_admin`, para
  que nadie se la active a sí mismo.
- Producción es Vercel + Supabase. El merge a `main` despliega y requiere aprobación de Josué.

## Enfoques considerados

| | Enfoque | Ventaja | Costo |
|---|---|---|---|
| **A (elegido)** | `consultations.tipo` + tabla `odontogramas` | Reutiliza historial, recetas, impresión, verificación y reportes; SQL aditivo | El formulario/impresión distinguen por tipo |
| B | Tabla `dental_consultations` separada | Aislamiento total | Duplica recetas, impresión, reportes; historial hay que unir dos tablas |
| C | Odontograma como JSON dentro de `consultations` | Lo más rápido | Difícil consultar evolución por pieza; contamina la consulta médica |

Josué eligió A porque el historial compartido es central y es lo que menos código nuevo exige.

## Diseño

### Datos (migración aditiva)

- `user_profiles.is_dentist boolean not null default false`.
  - Agregar la columna a `guard_user_profile_changes`.
  - Función `is_dentist_now()` (`SECURITY DEFINER`, como `is_org_admin_now`).
- `consultations.tipo text not null default 'MEDICA'`, con `check (tipo in ('MEDICA','DENTAL'))`.
  - Las filas existentes quedan como `MEDICA` por el valor por defecto.
  - Los campos dentales de texto (hallazgos intraorales, procedimientos realizados) se guardan
    en columnas nuevas nulas de `consultations` o en la tabla de odontograma. **Decisión del
    implementador**, siempre que sea aditivo.
- Tabla `odontogramas`:
  - `id`, `clinic_id`, `patient_id`, `consultation_id` (único, FK), `doctor_id`, `created_at`.
  - `denticion` (`PERMANENTE` | `TEMPORAL` | `MIXTA`).
  - `estado jsonb`: mapa pieza FDI → `{ caras: {V,L,M,D,O}: hallazgo, pieza: hallazgo, nota }`,
    más `regiones` (sextantes 1–6, arcada superior/inferior) → hallazgo/nota.
  - Un campo de versión del esquema JSON, para poder migrarlo en la fase 2.
- RLS:
  - `SELECT` de `odontogramas` por `clinic_id`, igual que `consultations`.
  - `INSERT`/`UPDATE` de `odontogramas` solo si `clinic_id = current_clinic_id()` y
    `is_dentist_now()`.
  - `consultations` insert/update: agregar la condición `tipo <> 'DENTAL' OR is_dentist_now()`.
    Las políticas actuales de `consultations` se reemplazan por una versión más estricta, pero
    el código viejo no inserta `DENTAL`, así que no se rompe nada.
  - Sin `DELETE` para `odontogramas`. Corregir significa guardar una consulta nueva.
- Trigger de auditoría (`audit_row`) también en `odontogramas`.

### Odontograma (componente)

- **Numeración FDI**: permanentes 11–18, 21–28, 31–38, 41–48; temporales 51–55, 61–65, 71–75,
  81–85.
- **Dentición:** se elige por la edad del paciente (temporal < 6 años, mixta 6–12, permanente
  ≥ 13), y el odontólogo puede cambiarla.
- Cada pieza tiene un **dibujo del diente** y un **círculo de 5 caras**: vestibular,
  lingual/palatino, mesial, distal y oclusal/incisal.
- **Regiones:** sextantes 1–6 y arcadas superior/inferior, para hallazgos que abarcan varias
  piezas (por ejemplo, prótesis total o cálculo generalizado).
- **Hallazgos iniciales** (lista cerrada, ampliable en la fase 2): caries, obturación/restauración,
  sellante, corona, endodoncia, extracción indicada, ausente, implante, prótesis fija/puente,
  prótesis removible (PR), fractura, movilidad y nota libre.
- **Colores:** **rojo** = patología o tratamiento por hacer; **azul** = tratamiento existente o
  realizado. Es la convención habitual en Latinoamérica; hay que confirmarla con los odontólogos.
- SVG propio, sin librerías externas. En modo solo lectura se muestra igual, sin interacción.
- Al abrir una consulta dental nueva, el odontograma se precarga con el último estado guardado
  del paciente.

### Pantallas y navegación

- **Menú "Odontología"** (visible para toda la clínica): consultas dentales recientes y búsqueda
  de pacientes.
- **Ficha del paciente:** pestaña "Odontograma" con el estado actual y las fechas anteriores,
  para elegir una y verla. Solo los odontólogos ven el botón **"Nueva consulta dental"**.
- **Nueva consulta dental:** formulario propio, que reutiliza componentes de la consulta actual
  donde aplique (receta, diagnóstico, alergias y antecedentes en vista lateral, historial
  unificado). Guarda por `/api/guardar/consulta-dental` y la lógica va en
  `utils/guardado/consulta-dental.ts`. Siguiendo el patrón actual, la consulta y el odontograma
  se guardan juntos; si el odontograma falla, la consulta no queda a medias.
- **Historial** (nueva consulta médica y ficha del paciente): las consultas `DENTAL` llevan la
  etiqueta "Odontología" y un enlace al odontograma de esa fecha.
- **Impresión:** variante dental de `app/consultations/[id]/print`, con el odontograma impreso.
- **Configuración/usuarios:** casilla "Es odontólogo", visible solo para el administrador de la
  clínica.

### Pruebas

- Unitarias (vitest): validación del JSON del odontograma, elección de dentición por edad,
  transformación de piezas FDI.
- SQL/RLS en Supabase local:
  - Un usuario que no es odontólogo no puede insertar en `odontogramas` ni consultas `DENTAL`.
  - Sí puede leerlas.
  - Otra clínica no ve nada.
- E2E (playwright):
  - El odontólogo crea una consulta dental con odontograma.
  - El médico la ve en su historial en solo lectura.
  - La consulta médica sigue funcionando igual.
- **Prueba manual en local con Josué antes del PR a `main`.**

### Puesta en producción

1. Aplicar el SQL aditivo en Supabase de producción (antes del merge).
2. Merge a `main` (con aprobación de Josué y CI en verde), fuera del horario de la clínica.
3. Verificar `/version.json`.
4. En superadmin, encender "Odontología" para San Martín y subir su `max_doctors_override`;
   crear los dos usuarios y activarles "Es odontólogo".

## Decisiones de Claude tras la revisión (Josué puede corregirlas)

- **Agenda:** los odontólogos usan la misma agenda. Si el médico de la cita es odontólogo, la
  cita abre la consulta dental (con `appointmentId`, y marca la cita como completada igual que
  hoy). Se cambia en `AppointmentCard.tsx` y `AgendaClient.tsx`.
- **Guardado todo o nada:** la consulta dental y su odontograma se guardan con una función de
  Postgres (RPC `guardar_consulta_dental`) en una sola transacción. La receta y los avisos
  siguen el patrón actual.
- **Borrado:** la FK de `odontogramas.consultation_id` usa `ON DELETE CASCADE`. Solo un
  odontólogo (o el administrador de la clínica) puede borrar una consulta `DENTAL`, y la política
  `consultations_delete` se ajusta para exigirlo.
- **Pantallas existentes:** las consultas dentales se incluyen en todas (lista de consultas,
  contadores del saludo, reportes, `/verificar`, correos al paciente), con la etiqueta
  "Odontología". Los signos vitales vacíos se muestran como "—". Los reportes por especialidad
  ya agrupan por `specialty`, así que los odontólogos aparecen solos.
- **Credencial en receta e impresión:** se usan los campos actuales (`specialty` = "Cirujano
  Dentista", `professional_id` = número de colegiado). **Hay que confirmar con los odontólogos**
  si su receta necesita otra leyenda legal.
- **Colores:** un solo mapa de colores, fácil de cambiar si los odontólogos usan otra convención.

## Lo que decide el implementador

- Si los textos dentales van en columnas nuevas de `consultations` o dentro de `odontogramas`.
- La estructura exacta del JSON, siempre que tenga versión y cubra piezas, caras y regiones.
- Qué componentes de `NewConsultationClient.tsx` (1356 líneas) se extraen para reutilizarlos y
  cuáles se duplican, sin cambiar el comportamiento de la consulta médica.
- El diseño visual del diente, tomando como referencia la imagen que compartió Josué.

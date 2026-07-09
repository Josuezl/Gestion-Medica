# Fechas en palabras + rediseño de Solicitudes + validación de nombre

**Fecha:** 2026-07-08
**Estado:** Aprobado

## Objetivo

Tres mejoras al flujo de citas del portal público y su aprobación:

1. Fechas de citas escritas **en palabras** (`jueves 9 de julio de 2026, 8:00 a. m.`) en lugar del formato corto (`09/07/2026, 08:00 a. m.`).
2. Rediseño de la información que lee la asistente antes de aprobar una cita — **letras más grandes, bajo cuadros**, look moderno y profesional.
3. Portal público: relajar la validación de nombre de **4 palabras obligatorias** a **3 obligatorias**, con confirmación al detectar exactamente 3.

## 1 · Fechas en palabras

**Formato elegido:** con día de la semana, mes en minúscula, sin coma tras el día de la semana (igual al portal público existente). Ej.: `jueves 9 de julio de 2026, 8:00 a. m.`

**Helpers nuevos/cambiados en `utils/datetime.ts`** (construidos con `Intl…formatToParts` en zona `America/Tegucigalpa` para controlar el formato y evitar la coma tras el weekday):

- `formatDateLongHN(instant)` → `"jueves 9 de julio de 2026"`
- `formatDateTimeLongHN(instant)` → `"jueves 9 de julio de 2026, 8:00 a. m."` — **reemplaza** la versión corta actual (usada solo por el cron de recordatorios, que es una fecha de cita y debe llevar el año).

**Alcance = "Todo"** (incluye sellos secundarios como "Recibida"). Call sites que pasan de `formatDateTimeHN` (corto) a la versión larga:

| Archivo | Campo |
|---|---|
| `app/dashboard/solicitudes/SolicitudesClient.tsx` | fecha/hora de la cita · "Recibida" |
| `app/dashboard/solicitudes/actions.ts` | mensaje WhatsApp aprobación ("Fecha y hora") |
| `app/dashboard/solicitudes/actions.ts` | mensaje WhatsApp rechazo (fecha de la cita) |
| `app/citas/[code]/page.tsx` | "Fecha y hora" (página pública de estado) |
| `app/dashboard/components/AppointmentCard.tsx` | recordatorio WhatsApp de la agenda (📅 Fecha, ahora con año) |
| `app/api/send-reminders/route.ts` | vía el helper compartido (upgrade automático) |

**Fuera de alcance:** las **fechas de nacimiento** siguen en formato corto (`15/06/1990`) — no son fechas de cita y escritas en palabras se leen raro.

## 2 · Rediseño tarjeta + modal de Solicitudes

Reemplazar la línea densa de texto muted por una **rejilla de cuadros etiquetados**: etiqueta en mayúsculas pequeña y muted, valor más grande. Componente reutilizable `<Field label value />` dentro del archivo. Se aplica a:

- La tarjeta de cada solicitud en la lista.
- Un **resumen de solo lectura** nuevo al inicio del modal "Aprobar solicitud" (hoy el modal no muestra un resumen de la cita).

Campos del cuadro: **Fecha y hora**, **Médico**, **Lugar**, **Teléfono**. Debajo, en texto pequeño: "Recibida" + código. Estilo con las CSS vars existentes (`--text-muted`, `--border-color`, `--bg-input`, `--bg-card`, `--radius-*`) para respetar el tema claro/oscuro.

## 3 · Validación de nombre (3 obligatorio, confirmar el 4º)

En `app/agendar/[token]/BookingWizard.tsx`, `handleIdentify`:

- **< 3 palabras** → error: "Escribe al menos tu nombre y tus dos apellidos (o tus dos nombres y un apellido), tal como aparecen en tu identidad."
- **exactamente 3 palabras** → mostrar una **compuerta de confirmación inline**: "Escribiste 3 nombres. ¿Tu nombre completo tiene solo 3 (un solo nombre o un solo apellido)?" → **[Sí, continuar]** procede · **[No, me falta uno]** cierra la compuerta y regresa el foco a la caja para agregar el 4º. Editar la caja resetea la compuerta.
- **≥ 4 palabras** → procede como hoy.

Texto de ayuda del paso 1 cambia de "tus 4 nombres" a permitir 3. **Sin cambios de servidor**: `identifyPatient`/`submitBooking` ya aceptan `words >= 2`. Corregir el comentario obsoleto "≥4 palabras" en `SubmitBookingPayload`.

## Verificación

- `npm run build` + `npm test` (incluye tests nuevos para `formatDateLongHN`/`formatDateTimeLongHN` en `tests/datetimeHN.test.ts`).
- E2E con puppeteer contra dev local: portal público con flujo de 3 palabras (confirmación) y aprobación de una solicitud mostrando las fechas en palabras.

## No incluido (YAGNI)

- No se cambia `splitFullName` (con 3 palabras ya divide 1 nombre + 2 apellidos; el registro es editable y el matching concatena).
- No se convierten fechas de nacimiento ni sellos de documentos clínicos (recetas, órdenes) — no son fechas de cita.

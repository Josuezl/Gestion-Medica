/**
 * Formato de fechas/horas en la zona horaria de Honduras.
 *
 * Los timestamps (created_at, scheduled_at, etc.) se guardan en UTC (correcto), pero al
 * formatearlos hay que fijar la zona horaria de Honduras; si no, el render del servidor
 * (Vercel corre en UTC) muestra la hora +6h. Forzar la zona aquí lo deja correcto sin
 * importar dónde se renderice (servidor, PDF, email o navegador).
 *
 * Nota: usar SOLO con timestamps (instantes). NO usar con fechas "puras" como birth_date,
 * que se manejan como fecha calendario y se desplazarían un día.
 */
const HN_TIME_ZONE = 'America/Tegucigalpa' // Honduras: UTC-6, sin horario de verano

/** "15/06/2026, 04:36 p. m." */
export function formatDateTimeHN(value: string | number | Date): string {
  return new Date(value).toLocaleString('es-HN', {
    timeZone: HN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/** Partes de fecha/hora ya fijadas a Honduras, para armar formatos a mano (Intl mete una coma
 * tras el día de la semana; armándolo por partes controlamos el texto exacto). */
function partsHN(value: string | number | Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('es-HN', { timeZone: HN_TIME_ZONE, ...opts }).formatToParts(new Date(value))) {
    out[p.type] = p.value
  }
  return out
}

/** "8:00 a. m." — hora 12h sin cero inicial (instante, zona HN). */
function timeShortHN(value: string | number | Date): string {
  const p = partsHN(value, { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${p.hour}:${p.minute} ${p.dayPeriod}`
}

/** "jueves 9 de julio de 2026" — fecha larga en palabras (instante, zona HN). Sin la coma que
 * mete Intl tras el día de la semana, para igualar el formato del portal público. */
export function formatDateLongHN(value: string | number | Date): string {
  const p = partsHN(value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${p.weekday} ${p.day} de ${p.month} de ${p.year}`
}

/** "jueves 9 de julio de 2026, 8:00 a. m." — fecha larga + hora, para fechas de CITA
 * (mensajes al paciente, tarjetas de solicitud, recordatorios, página de estado). */
export function formatDateTimeLongHN(value: string | number | Date): string {
  return `${formatDateLongHN(value)}, ${timeShortHN(value)}`
}

/** "04:36 p. m." */
export function formatTimeHN(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString('es-HN', {
    timeZone: HN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/** "15/06/2026" */
export function formatDateHN(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('es-HN', {
    timeZone: HN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Día CALENDARIO de Honduras de un instante, como `YYYY-MM-DD`.
 *
 * Estable en servidor y navegador: fija la zona horaria, así que un timestamp UTC se agrupa
 * en el día correcto sin importar dónde se ejecute. Úsalo para agrupar/comparar citas por día
 * (evita el desfase SSR-UTC vs navegador-HN que hacía "parpadear" citas nocturnas al día
 * siguiente). `en-CA` produce el formato ISO `YYYY-MM-DD`.
 */
export function ymdHN(value: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

/** Hora de reloj de Honduras en 24h (`"18:00"`, medianoche = `"00:00"`). Estable server/cliente. */
export function hm24HN(value: string | number | Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

/** Minutos desde medianoche (hora de Honduras) de un instante. Para posicionar en la rejilla horaria. */
export function minutesOfDayHN(value: string | number | Date): number {
  const [h, m] = hm24HN(value).split(':').map(Number)
  return h * 60 + m
}

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

/** "lunes, 15 de junio, 04:36 p. m." — para mensajes al paciente (recordatorios). */
export function formatDateTimeLongHN(value: string | number | Date): string {
  return new Date(value).toLocaleString('es-HN', {
    timeZone: HN_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
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

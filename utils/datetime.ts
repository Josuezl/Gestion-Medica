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

/** "15/06/2026" */
export function formatDateHN(value: string | number | Date): string {
  return new Date(value).toLocaleDateString('es-HN', {
    timeZone: HN_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

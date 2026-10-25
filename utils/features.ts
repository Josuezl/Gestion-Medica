/**
 * Interruptores globales de funciones (aplican a todos los tenants).
 *
 * SUBIDA_ESTUDIOS_HABILITADA: pestaña «Estudios Médicos» (subir radiografías/PDF a Storage).
 * Apagada el 2026-10-25: nadie la usaba (solo 5 pruebas en junio, ya borradas) y era el mayor riesgo
 * de llenar el Storage del plan Free; los médicos copian los estudios en la consulta. El candado real
 * está en la base (sin permiso de insertar en el bucket medical-studies ni en la tabla studies):
 * para reactivarla hay que volver a crear esos permisos además de poner esto en true.
 */
export const SUBIDA_ESTUDIOS_HABILITADA = false

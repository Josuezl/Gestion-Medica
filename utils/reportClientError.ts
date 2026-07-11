'use client'

import type { ClientErrorKind } from './clientErrorReport'

/**
 * Envía un reporte de error a /api/client-errors, fire-and-forget: jamás bloquea ni rompe la UX
 * (si el propio reporte falla, se ignora). Solo tiene sentido con internet: sin conexión el POST
 * no puede salir, así que el que llama decide no invocarlo cuando navigator.onLine === false.
 */
export function reportClientError(kind: ClientErrorKind, message: string, durationMs: number): void {
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive: el POST sobrevive aunque el médico navegue o recargue justo después.
      keepalive: true,
      body: JSON.stringify({
        kind,
        message,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        onLine: navigator.onLine,
        durationMs,
      }),
    }).catch(() => {})
  } catch {
    // nunca dejar que el reporte cause otro error
  }
}

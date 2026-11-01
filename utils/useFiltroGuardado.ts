'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Filtro que sobrevive a ir y volver del dashboard (abrir una cita, una consulta, el navegador
// «atrás»): vive en localStorage de este navegador y solo cambia cuando el usuario lo cambia.
// useSyncExternalStore evita leer localStorage en el render del servidor (sin desfase al hidratar).

const EVENTO = 'filtro-guardado'
// Respaldo en memoria si el navegador bloquea localStorage (modo privado): el filtro funciona en
// esta pestaña aunque no se recuerde al recargar.
const memoria = new Map<string, string>()

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave) ?? memoria.get(clave) ?? null
  } catch {
    return memoria.get(clave) ?? null
  }
}

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO, aviso)
    window.removeEventListener('storage', aviso)
  }
}

/**
 * Valor guardado bajo `clave`, o `porDefecto` si no hay uno o no pasa `esValido` (p. ej. un médico
 * que ya no está en la lista).
 */
export function useFiltroGuardado(clave: string, porDefecto: string, esValido: (v: string) => boolean): [string, (v: string) => void] {
  const guardado = useSyncExternalStore(suscribir, () => leer(clave), () => null)
  const valor = guardado !== null && esValido(guardado) ? guardado : porDefecto
  const cambiar = useCallback((v: string) => {
    memoria.set(clave, v)
    try {
      window.localStorage.setItem(clave, v)
    } catch {
      // sin almacenamiento: queda el respaldo en memoria
    }
    window.dispatchEvent(new Event(EVENTO))
  }, [clave])
  return [valor, cambiar]
}

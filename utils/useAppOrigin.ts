'use client'

import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}

/**
 * Origin de la app (p. ej. https://cloudmedhn.com) seguro para SSR: devuelve '' en el
 * servidor y window.location.origin en el cliente, sin efectos ni errores de hidratación.
 */
export function useAppOrigin(): string {
  return useSyncExternalStore(
    emptySubscribe,
    () => window.location.origin,
    () => ''
  )
}

'use client'

/**
 * Cliente de las rutas /api/guardar/*. Un estado HTTP no-OK lanza, para que caiga en el `catch`
 * que cada pantalla ya tiene (en la consulta: timeout, sin conexión y reportClientError).
 */
export async function guardarEnApi<T>(ruta: string, fd: FormData): Promise<T> {
  const res = await fetch(ruta, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return (await res.json()) as T
}

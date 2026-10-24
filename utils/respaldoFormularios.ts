'use client'

/**
 * Red de formularios (parte DOM): antes de «Actualizar» copia lo escrito en sessionStorage y,
 * tras recargar, lo vuelve a llenar con los setters nativos para que React vea el cambio.
 * Los formularios con `data-respaldo-propio` (la consulta, que ya tiene borrador) se saltan.
 */
import { CLAVE_RESPALDO, empaquetarRespaldo, leerRespaldo, type CamposRespaldo } from './appVersion'

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const TIPOS_EXCLUIDOS = new Set(['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'])
const REINTENTO_MS = 250
const ESPERA_MAX_MS = 5000

function sesion(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function formulariosConRespaldo(): { clave: string; form: HTMLFormElement }[] {
  return Array.from(document.forms)
    .map((form, i) => ({ clave: form.id || String(i), form }))
    .filter(({ form }) => !form.hasAttribute('data-respaldo-propio'))
}

function camposDe(form: HTMLFormElement): Campo[] {
  return Array.from(form.elements).filter((el): el is Campo =>
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
    && Boolean(el.name)
    && !(el instanceof HTMLInputElement && TIPOS_EXCLUIDOS.has(el.type)))
}

function esMarcable(el: Campo): el is HTMLInputElement {
  return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
}

// Radios del mismo grupo comparten `name`: se distingue cada opción por su valor.
function claveCampo(el: Campo): string {
  return el instanceof HTMLInputElement && el.type === 'radio' ? `${el.name}=${el.value}` : el.name
}

export function guardarRespaldoFormularios(): void {
  const campos: CamposRespaldo = {}
  for (const { clave, form } of formulariosConRespaldo()) {
    const valores: Record<string, string> = {}
    for (const el of camposDe(form)) {
      valores[claveCampo(el)] = esMarcable(el) ? String(el.checked) : el.value
    }
    if (Object.keys(valores).length > 0) campos[clave] = valores
  }
  if (Object.keys(campos).length === 0) return
  try {
    sesion()?.setItem(CLAVE_RESPALDO, empaquetarRespaldo(window.location.pathname, campos, Date.now()))
  } catch {
    // Storage lleno o bloqueado: se recarga igual, sin respaldo.
  }
}

function asignar(el: Campo, valor: string): boolean {
  if (esMarcable(el)) {
    const marcado = valor === 'true'
    if (el.checked === marcado) return false
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set?.call(el, marcado)
  } else {
    if (el.value === valor) return false
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor)
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/** Llena los formularios con el respaldo de esta ruta; `true` si cambió algún campo. */
export async function restaurarRespaldoFormularios(): Promise<boolean> {
  const almacen = sesion()
  let raw: string | null = null
  try {
    raw = almacen?.getItem(CLAVE_RESPALDO) ?? null
  } catch {
    return false
  }
  const respaldo = leerRespaldo(raw, window.location.pathname, Date.now())
  if (!respaldo) return false

  // Hay pantallas que cargan datos antes de pintar el formulario: se espera hasta 5 s.
  const pendientes = new Set(Object.keys(respaldo))
  let lleno = false
  const limite = Date.now() + ESPERA_MAX_MS
  while (pendientes.size > 0) {
    for (const { clave, form } of formulariosConRespaldo()) {
      if (!pendientes.has(clave)) continue
      const valores = respaldo[clave]
      for (const el of camposDe(form)) {
        const valor = valores[claveCampo(el)]
        if (valor !== undefined && asignar(el, valor)) lleno = true
      }
      pendientes.delete(clave)
    }
    if (pendientes.size === 0 || Date.now() >= limite) break
    await new Promise((r) => setTimeout(r, REINTENTO_MS))
  }

  try {
    almacen?.removeItem(CLAVE_RESPALDO)
  } catch {
    // Igual vence a los 10 minutos.
  }
  return lleno
}

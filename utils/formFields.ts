// Leer y escribir campos de formularios NO controlados por su atributo `name`, incluidos radios
// (RadioNodeList) y checkboxes. Lo usan el borrador local y la pre-clínica en vivo, que escriben
// directo en el DOM. Solo cliente.

/** Valor actual del campo, como lo enviaría FormData ('' si no hay nada marcado o no existe). */
export function readFormField(form: HTMLFormElement | null, name: string): string {
  const el = form?.elements.namedItem(name)
  if (!el) return ''
  if (el instanceof RadioNodeList) return el.value
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked ? el.value : ''
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value
  return ''
}

/** Escribe el valor; en radios marca el que coincide y en checkboxes marca si el valor no está vacío. */
export function writeFormField(form: HTMLFormElement | null, name: string, value: string): void {
  const el = form?.elements.namedItem(name)
  if (!el) return
  if (el instanceof RadioNodeList) {
    el.forEach((node) => {
      if (node instanceof HTMLInputElement && node.type === 'radio') node.checked = node.value === value
    })
    return
  }
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.checked = value !== ''
    return
  }
  if (el instanceof HTMLInputElement && el.type === 'radio') {
    el.checked = el.value === value
    return
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.value = value
}

/**
 * Cuadros de texto que crecen con lo escrito. Con la clase `auto-crece` el navegador lo hace solo
 * donde soporta `field-sizing: content` (también con texto puesto por código, como el borrador);
 * en los demás, este manejador de `onInput` ajusta la altura al contenido.
 */
export function autoCrecer(e: { currentTarget: HTMLTextAreaElement }) {
  ajustarAltura(e.currentTarget)
}

function soportaFieldSizing(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')
}

function ajustarAltura(el: HTMLTextAreaElement) {
  if (soportaFieldSizing()) return
  // Oculto (p. ej. antecedente en «Niega»): scrollHeight es 0; se ajusta al mostrarse.
  if (el.offsetParent === null) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

/**
 * Ajusta de una vez todos los `.auto-crece` dentro de `root`: al abrir una pantalla con texto ya
 * escrito (antecedentes del expediente, borrador restaurado), que no pasa por `onInput`.
 */
export function ajustarAutoCrece(root: ParentNode | null | undefined) {
  if (!root || soportaFieldSizing()) return
  root.querySelectorAll<HTMLTextAreaElement>('textarea.auto-crece').forEach(ajustarAltura)
}

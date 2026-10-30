/**
 * Cuadros de texto que crecen con lo escrito. Con la clase `auto-crece` el navegador lo hace solo
 * donde soporta `field-sizing: content` (también con texto puesto por código, como el borrador);
 * en los demás, este manejador de `onInput` ajusta la altura al contenido.
 */
export function autoCrecer(e: { currentTarget: HTMLTextAreaElement }) {
  const el = e.currentTarget
  if (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + 2}px`
}

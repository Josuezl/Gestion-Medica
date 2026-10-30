/**
 * Antecedentes del paciente con estado: Sin registrar / Niega / Refiere. Lógica pura compartida por
 * Nueva Consulta, la edición del paciente, los guardados en servidor y las vistas.
 *
 * En la base: el texto de siempre (`allergies`, `pathological_history`…) más `<campo>_status`.
 * Un estado NULL (registros de antes del 2026-10-29) se deduce del texto, sin reescribir nada:
 * vacío, «Ninguna conocida» (valor por defecto del sistema anterior) o «desconoce» → Sin registrar;
 * «niega», «ninguno», «negativo»… → Niega; cualquier otro texto → Refiere con ese detalle.
 *
 * En el formulario: `<campo>_status` (radio), `<campo>` (texto: detalle u observación) y
 * `<campo>_obs` (casilla «Añadir observación», solo de interfaz).
 */

export type EstadoAntecedente = 'sin_registrar' | 'niega' | 'refiere'
export type CampoAntecedente = 'allergies' | 'pathological_history' | 'non_pathological_history' | 'family_history'

export interface DefinicionAntecedente {
  campo: CampoAntecedente
  titulo: string
  descripcion: string
  /** «El paciente niega …» */
  niega: string
  detalle: string
  placeholder: string
}

export const ANTECEDENTES: DefinicionAntecedente[] = [
  {
    campo: 'allergies', titulo: 'Alergias', descripcion: 'Medicamentos, alimentos y otras sustancias.',
    niega: 'El paciente niega alergias.', detalle: 'Detalles de la alergia', placeholder: 'Describe la sustancia y la reacción…',
  },
  {
    campo: 'pathological_history', titulo: 'Antecedentes patológicos', descripcion: 'Enfermedades, cirugías y hospitalizaciones.',
    niega: 'El paciente niega antecedentes patológicos.', detalle: 'Detalles de los antecedentes patológicos', placeholder: 'Enfermedades, cirugías, hospitalizaciones…',
  },
  {
    campo: 'non_pathological_history', titulo: 'Antecedentes no patológicos', descripcion: 'Hábitos y estilo de vida.',
    niega: 'El paciente niega antecedentes no patológicos.', detalle: 'Detalles de los antecedentes no patológicos', placeholder: 'Tabaco, alcohol, actividad física, alimentación…',
  },
  {
    campo: 'family_history', titulo: 'Antecedentes heredofamiliares', descripcion: 'Enfermedades relevantes en la familia.',
    niega: 'El paciente niega antecedentes heredofamiliares.', detalle: 'Detalles de los antecedentes heredofamiliares', placeholder: 'Familiar y enfermedad…',
  },
]

const ESTADOS = new Set<EstadoAntecedente>(['sin_registrar', 'niega', 'refiere'])

const normalizar = (v: string | null | undefined) =>
  (v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ')

const NEGACIONES = new Set(['niega', 'n iega', 'ninguno', 'ninguna', 'negativo', 'negativos', 'no', 'nada'])
const SIN_DATO = new Set(['ninguna conocida', 'desconoce'])

/** ¿El texto solo dice que no hay antecedente («niega», «ninguno»…)? */
export function esNegacion(texto: string | null | undefined): boolean {
  return NEGACIONES.has(normalizar(texto))
}

/** Estado deducido de un texto sin estado guardado (registros anteriores). */
export function inferirEstado(texto: string | null | undefined): EstadoAntecedente {
  const t = normalizar(texto)
  if (!t || SIN_DATO.has(t)) return 'sin_registrar'
  if (NEGACIONES.has(t)) return 'niega'
  return 'refiere'
}

export function estadoEfectivo(estado: string | null | undefined, texto: string | null | undefined): EstadoAntecedente {
  return estado && ESTADOS.has(estado as EstadoAntecedente) ? (estado as EstadoAntecedente) : inferirEstado(texto)
}

/** Texto que va en el cuadro al abrir el formulario: el detalle (Refiere) o la observación (Niega). */
export function textoInicial(estado: EstadoAntecedente, texto: string | null | undefined): string {
  const t = (texto ?? '').trim()
  if (estado === 'refiere') return t
  if (estado === 'niega' && !esNegacion(t)) return t
  return ''
}

/** Para las vistas: «Sin registrar», «Niega», «Niega · observación» o el detalle. */
export function antecedenteParaMostrar(estado: string | null | undefined, texto: string | null | undefined): string {
  const e = estadoEfectivo(estado, texto)
  const t = (texto ?? '').trim()
  if (e === 'sin_registrar') return 'Sin registrar'
  if (e === 'niega') return t && !esNegacion(t) ? `Niega · ${t}` : 'Niega'
  return t
}

export type CambiosAntecedentes = Partial<Record<CampoAntecedente | `${CampoAntecedente}_status`, string | null>>

/**
 * Lo que hay que guardar en `patients` a partir del formulario.
 * - Con estado (interfaz nueva): Sin registrar no toca el texto; Niega guarda la observación (o
 *   nada); Refiere exige el detalle.
 * - Sin estado (pestaña de antes del despliegue): guarda el texto y deja el estado en NULL para
 *   que se vuelva a deducir.
 */
export function antecedentesDesdeFormulario(formData: FormData): { cambios: CambiosAntecedentes; error: string | null } {
  const cambios: CambiosAntecedentes = {}
  for (const def of ANTECEDENTES) {
    const { campo } = def
    const texto = ((formData.get(campo) as string | null) ?? '').trim()
    const estado = formData.get(`${campo}_status`) as string | null
    if (estado !== null) {
      if (!ESTADOS.has(estado as EstadoAntecedente)) continue
      cambios[`${campo}_status`] = estado
      if (estado === 'niega') cambios[campo] = texto || null
      if (estado === 'refiere') {
        if (!texto) return { cambios: {}, error: `Escribe los detalles en «${def.titulo}» o cambia la opción.` }
        cambios[campo] = texto
      }
    } else if (formData.has(campo)) {
      cambios[campo] = texto || null
      cambios[`${campo}_status`] = null
    }
  }
  return { cambios, error: null }
}

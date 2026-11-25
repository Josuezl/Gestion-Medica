import { ymdHN } from '@/utils/datetime'

export type Cara = 'V' | 'L' | 'M' | 'D' | 'O'
export type Region = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'AS' | 'AI'
export type Hallazgo =
  | 'CARIES' | 'OBTURACION' | 'SELLANTE' | 'CORONA' | 'ENDODONCIA'
  | 'EXTRACCION_INDICADA' | 'AUSENTE' | 'IMPLANTE' | 'PUENTE' | 'PROTESIS_REMOVIBLE'
  | 'FRACTURA' | 'MOVILIDAD'
export type EstadoMarca = 'PENDIENTE' | 'REALIZADO'
export type Marca = { hallazgo: Hallazgo; estado: EstadoMarca }
export type Pieza = { caras?: Partial<Record<Cara, Marca>>; pieza?: Marca; nota?: string }
export type Denticion = 'PERMANENTE' | 'TEMPORAL' | 'MIXTA'
export type EstadoOdontograma = {
  version: 1
  piezas: Record<string, Pieza>
  regiones: Partial<Record<Region, Marca & { nota?: string }>>
}

export const PIEZAS_PERMANENTES: number[] = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]

export const PIEZAS_TEMPORALES: number[] = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
  85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
]

type Nivel = 'cara' | 'pieza' | 'region'

export const HALLAZGOS: { codigo: Hallazgo; etiqueta: string; niveles: Nivel[] }[] = [
  { codigo: 'CARIES', etiqueta: 'Caries', niveles: ['cara'] },
  { codigo: 'OBTURACION', etiqueta: 'Obturación', niveles: ['cara'] },
  { codigo: 'SELLANTE', etiqueta: 'Sellante', niveles: ['cara'] },
  { codigo: 'CORONA', etiqueta: 'Corona', niveles: ['pieza'] },
  { codigo: 'ENDODONCIA', etiqueta: 'Endodoncia', niveles: ['pieza'] },
  { codigo: 'EXTRACCION_INDICADA', etiqueta: 'Extracción indicada', niveles: ['pieza'] },
  { codigo: 'AUSENTE', etiqueta: 'Ausente', niveles: ['pieza'] },
  { codigo: 'IMPLANTE', etiqueta: 'Implante', niveles: ['pieza'] },
  { codigo: 'PUENTE', etiqueta: 'Puente', niveles: ['pieza', 'region'] },
  { codigo: 'PROTESIS_REMOVIBLE', etiqueta: 'Prótesis removible', niveles: ['pieza', 'region'] },
  { codigo: 'FRACTURA', etiqueta: 'Fractura', niveles: ['cara'] },
  { codigo: 'MOVILIDAD', etiqueta: 'Movilidad', niveles: ['pieza'] },
]

export const COLOR_ESTADO: Record<EstadoMarca, string> = {
  PENDIENTE: '#dc2626',
  REALIZADO: '#2563eb',
}

export function piezasDe(d: Denticion): number[] {
  if (d === 'PERMANENTE') return [...PIEZAS_PERMANENTES]
  if (d === 'TEMPORAL') return [...PIEZAS_TEMPORALES]
  return [...PIEZAS_PERMANENTES, ...PIEZAS_TEMPORALES]
}

export function denticionPorEdad(birthDate: string | null, hoy?: Date): Denticion {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return 'PERMANENTE'
  const nacimiento = new Date(birthDate)
  if (Number.isNaN(nacimiento.getTime()) || nacimiento.toISOString().slice(0, 10) !== birthDate) {
    return 'PERMANENTE'
  }
  if (hoy && Number.isNaN(hoy.getTime())) return 'PERMANENTE'

  // La fecha de referencia explícita se lee en UTC para admitir fechas ISO sin hora.
  const fechaActual = hoy ? hoy.toISOString().slice(0, 10) : ymdHN(new Date())
  if (birthDate > fechaActual) return 'PERMANENTE'

  let edad = Number(fechaActual.slice(0, 4)) - nacimiento.getUTCFullYear()
  if (fechaActual.slice(5) < birthDate.slice(5)) edad--
  if (edad < 6) return 'TEMPORAL'
  if (edad < 13) return 'MIXTA'
  return 'PERMANENTE'
}

export function estadoVacio(): EstadoOdontograma {
  return { version: 1, piezas: {}, regiones: {} }
}

const PIEZAS_FDI = new Set(piezasDe('MIXTA').map(String))
const CARAS: readonly Cara[] = ['V', 'L', 'M', 'D', 'O']
const ETIQUETAS_REGION: Record<Region, string> = {
  S1: 'Sextante 1', S2: 'Sextante 2', S3: 'Sextante 3',
  S4: 'Sextante 4', S5: 'Sextante 5', S6: 'Sextante 6',
  AS: 'Arcada superior', AI: 'Arcada inferior',
}
export const REGIONES = Object.keys(ETIQUETAS_REGION) as Region[]
const RANGOS_SEXTANTES = {
  S1: ['18–14', '55–54'], S2: ['13–23', '53–63'], S3: ['24–28', '64–65'],
  S4: ['34–38', '74–75'], S5: ['33–43', '73–83'], S6: ['44–48', '84–85'],
}

export function etiquetaRegion(region: Region, denticion: Denticion) {
  const etiqueta = ETIQUETAS_REGION[region]
  if (region === 'AS' || region === 'AI') return etiqueta
  const [permanente, temporal] = RANGOS_SEXTANTES[region]
  const rango = denticion === 'MIXTA' ? `${permanente} · ${temporal}` : denticion === 'TEMPORAL' ? temporal : permanente
  return `${etiqueta} (${rango})`
}

export function esSuperior(fdi: number) {
  return [1, 2, 5, 6].includes(Math.floor(fdi / 10))
}

export function nombreSuperficie(fdi: number, cara: Cara) {
  const nombres: Record<Cara, string> = {
    V: 'Vestibular', L: esSuperior(fdi) ? 'Palatina' : 'Lingual',
    M: 'Mesial', D: 'Distal', O: fdi % 10 <= 3 ? 'Incisal' : 'Oclusal',
  }
  return nombres[cara]
}

type LugarTrabajo = { fdi: number; superficie?: string } | { region: Region }
export type TrabajoOdontologico = LugarTrabajo & { hallazgo: Hallazgo; etiqueta: string; nota?: string }

export function trabajosPendientes(estado: EstadoOdontograma): TrabajoOdontologico[] {
  return listarTrabajos(estado, 'PENDIENTE', null)
}

export function realizadosNuevos(actual: EstadoOdontograma, anterior: EstadoOdontograma | null): TrabajoOdontologico[] {
  return listarTrabajos(actual, 'REALIZADO', anterior)
}

function listarTrabajos(estado: EstadoOdontograma, filtro: EstadoMarca, anterior: EstadoOdontograma | null): TrabajoOdontologico[] {
  const trabajos: TrabajoOdontologico[] = []

  function agregar(lugar: LugarTrabajo, marca?: Marca, nota?: string, previa?: Marca) {
    if (marca?.estado !== filtro || (previa?.estado === filtro && previa.hallazgo === marca.hallazgo)) return
    const etiqueta = HALLAZGOS.find(({ codigo }) => codigo === marca.hallazgo)!.etiqueta
    trabajos.push({ ...lugar, hallazgo: marca.hallazgo, etiqueta, ...(nota !== undefined ? { nota } : {}) })
  }

  for (const fdi of Object.keys(estado.piezas).map(Number).sort((a, b) => a - b)) {
    const pieza = estado.piezas[fdi]
    const previa = anterior?.piezas[fdi]
    agregar({ fdi }, pieza.pieza, pieza.nota, previa?.pieza)
    for (const cara of CARAS) {
      agregar({ fdi, superficie: nombreSuperficie(fdi, cara) }, pieza.caras?.[cara], pieza.nota, previa?.caras?.[cara])
    }
  }

  for (const region of REGIONES) {
    const marca = estado.regiones[region]
    agregar({ region }, marca, marca?.nota, anterior?.regiones[region])
  }

  return trabajos
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  if (typeof x !== 'object' || x === null) return false
  const prototipo = Object.getPrototypeOf(x)
  return prototipo === Object.prototype || prototipo === null
}

function notaValida(nota: unknown): nota is string | undefined {
  return nota === undefined || (typeof nota === 'string' && nota.length <= 500)
}

function marcaValida(marca: unknown, nivel: Nivel): marca is Marca & Record<string, unknown> {
  return esObjeto(marca)
    && typeof marca.estado === 'string'
    && Object.hasOwn(COLOR_ESTADO, marca.estado)
    && HALLAZGOS.some(({ codigo, niveles }) => codigo === marca.hallazgo && niveles.includes(nivel))
}

export function validarEstado(x: unknown): { ok: true; estado: EstadoOdontograma } | { ok: false; error: string } {
  if (!esObjeto(x)) return { ok: false, error: 'El odontograma debe ser un objeto.' }
  if (x.version !== 1) return { ok: false, error: 'La versión del odontograma debe ser 1.' }
  if (!esObjeto(x.piezas) || !esObjeto(x.regiones)) {
    return { ok: false, error: 'El odontograma debe incluir mapas de piezas y regiones.' }
  }

  const estado = estadoVacio()

  // Las marcas de piezas ocultas siguen siendo válidas al cambiar de dentición.
  for (const [fdi, pieza] of Object.entries(x.piezas)) {
    if (!PIEZAS_FDI.has(fdi)) return { ok: false, error: 'El odontograma contiene una pieza FDI inválida.' }
    if (!esObjeto(pieza)) return { ok: false, error: `La pieza ${fdi} debe ser un objeto.` }
    if (!notaValida(pieza.nota)) {
      return { ok: false, error: `La nota de la pieza ${fdi} debe ser texto de hasta 500 caracteres.` }
    }
    const limpia: Pieza = {}
    if (pieza.nota) limpia.nota = pieza.nota
    if (pieza.pieza !== undefined) {
      if (!marcaValida(pieza.pieza, 'pieza')) {
        return { ok: false, error: `La marca de la pieza ${fdi} no es válida.` }
      }
      limpia.pieza = { hallazgo: pieza.pieza.hallazgo, estado: pieza.pieza.estado }
    }
    if (pieza.caras !== undefined) {
      if (!esObjeto(pieza.caras)) return { ok: false, error: `Las caras de la pieza ${fdi} deben ser un objeto.` }
      const caras: NonNullable<Pieza['caras']> = {}
      for (const [cara, marca] of Object.entries(pieza.caras)) {
        if (!CARAS.includes(cara as Cara)) return { ok: false, error: `La pieza ${fdi} contiene una cara inválida.` }
        if (!marcaValida(marca, 'cara')) {
          return { ok: false, error: `La marca en la cara ${cara} de la pieza ${fdi} no es válida.` }
        }
        caras[cara as Cara] = { hallazgo: marca.hallazgo, estado: marca.estado }
      }
      if (Object.keys(caras).length > 0) limpia.caras = caras
    }
    if (Object.keys(limpia).length > 0) estado.piezas[fdi] = limpia
  }

  for (const [region, marca] of Object.entries(x.regiones)) {
    if (!Object.hasOwn(ETIQUETAS_REGION, region)) return { ok: false, error: 'El odontograma contiene una región inválida.' }
    if (!marcaValida(marca, 'region')) {
      return { ok: false, error: `La marca de la región ${region} no es válida.` }
    }
    if (!notaValida(marca.nota)) {
      return { ok: false, error: `La nota de la región ${region} debe ser texto de hasta 500 caracteres.` }
    }
    estado.regiones[region as Region] = {
      hallazgo: marca.hallazgo,
      estado: marca.estado,
      ...(marca.nota !== undefined ? { nota: marca.nota } : {}),
    }
  }

  return { ok: true, estado }
}

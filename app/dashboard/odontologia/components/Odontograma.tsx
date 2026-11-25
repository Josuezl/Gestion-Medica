'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, NotebookPen, Trash2 } from 'lucide-react'
import {
  COLOR_ESTADO, HALLAZGOS, REGIONES, esSuperior, etiquetaRegion, nombreSuperficie, piezasDe,
  type Cara, type Denticion, type EstadoMarca, type EstadoOdontograma, type Hallazgo, type Marca, type Region,
} from '@/utils/odontograma'
import { siluetaDe } from './dientes'

type Props = {
  estado: EstadoOdontograma
  denticion: Denticion
  onChange?: (estado: EstadoOdontograma) => void
  onDenticionChange?: (denticion: Denticion) => void
  soloLectura?: boolean
  mostrarLeyenda?: boolean
}

type Objetivo =
  | { nivel: 'cara'; fdi: number; cara: Cara }
  | { nivel: 'pieza'; fdi: number }
  | { nivel: 'region'; region: Region }

const DENTICIONES: Record<Denticion, string> = { PERMANENTE: 'Permanente', TEMPORAL: 'Temporal', MIXTA: 'Mixta' }
const ESTADOS: Record<EstadoMarca, string> = { PENDIENTE: 'Pendiente', REALIZADO: 'Realizado' }
const SECTORES = [
  { camino: 'M8.44 8.44 A22 22 0 0 1 39.56 8.44 L32 16 H16 Z', x: 24, y: 10 },
  { camino: 'M8.44 39.56 A22 22 0 0 1 8.44 8.44 L16 16 V32 Z', x: 10, y: 24 },
  { camino: 'M16 16 H32 V32 H16 Z', x: 24, y: 24 },
  { camino: 'M39.56 8.44 A22 22 0 0 1 39.56 39.56 L32 32 V16 Z', x: 38, y: 24 },
  { camino: 'M39.56 39.56 A22 22 0 0 1 8.44 39.56 L16 32 H32 Z', x: 24, y: 38 },
]

export function ubicacion(objetivo: Objetivo, denticion: Denticion = 'PERMANENTE'): string {
  if (objetivo.nivel === 'region') return etiquetaRegion(objetivo.region, denticion)
  if (objetivo.nivel === 'pieza') return `Pieza ${objetivo.fdi}`

  const { fdi, cara } = objetivo
  return `Pieza ${fdi}, cara ${nombreSuperficie(fdi, cara).toLowerCase()}`
}

export function descripcion(marca?: Marca, nota?: string): string | undefined {
  const hallazgo = marca && HALLAZGOS.find(({ codigo }) => codigo === marca.hallazgo)?.etiqueta
  return [hallazgo, marca && ESTADOS[marca.estado], nota].filter(Boolean).join(' · ') || undefined
}

function SimboloPieza({ marca, silueta }: { marca: Marca; silueta: ReturnType<typeof siluetaDe> }) {
  const color = COLOR_ESTADO[marca.estado]
  switch (marca.hallazgo) {
    case 'CORONA':
      return <path d={silueta.corona} fill="none" stroke={color} strokeWidth="3" />
    case 'ENDODONCIA':
      return <path d={silueta.conductos} fill="none" stroke={color} strokeWidth="3" />
    case 'EXTRACCION_INDICADA':
      return <path d="M8 10 L40 56 M40 10 L8 56" stroke={color} strokeWidth="3" strokeDasharray="4 4" />
    case 'AUSENTE':
      return <path d="M8 10 L40 56 M40 10 L8 56" stroke={color} strokeWidth="3" />
    case 'IMPLANTE':
      return <path d="M20 8 H28 L31 36 H17 Z M19 15 H29 M18 22 H30 M18 29 H30 M16 40 H32"
        fill="none" stroke={color} strokeWidth="2.5" />
    case 'PUENTE':
      return <path d="M5 54 H43 M8 48 V59 M40 48 V59" fill="none" stroke={color} strokeWidth="3" />
    case 'MOVILIDAD':
      return <path d="M5 50 H43 M12 44 L5 50 L12 56 M36 44 L43 50 L36 56"
        fill="none" stroke={color} strokeWidth="2.5" />
    default:
      return null
  }
}

function Diente({ fdi, estado, seleccionar }: {
  fdi: number
  estado: EstadoOdontograma
  seleccionar?: (objetivo: Objetivo) => void
}) {
  const detalleId = useId()
  const superior = esSuperior(fdi)
  const mesialDerecha = [1, 4, 5, 8].includes(Math.floor(fdi / 10))
  const caras: Cara[] = [
    superior ? 'V' : 'L', mesialDerecha ? 'D' : 'M', 'O', mesialDerecha ? 'M' : 'D', superior ? 'L' : 'V',
  ]
  const datos = estado.piezas[fdi]
  const marca = datos?.pieza
  const silueta = siluetaDe(fdi)
  const objetivo = { nivel: 'pieza', fdi } as const
  const detallePieza = descripcion(marca, datos?.nota)
  const dibujo = (
    <button
      type="button"
      className="odontograma-control"
      aria-disabled={seleccionar ? undefined : true}
      aria-haspopup={seleccionar ? 'dialog' : undefined}
      aria-label={ubicacion(objetivo)}
      aria-describedby={detallePieza ? detalleId : undefined}
      title={detallePieza ?? ubicacion(objetivo)}
      onClick={seleccionar ? () => seleccionar(objetivo) : undefined}
      style={{ display: 'block', position: 'relative', width: 48, height: 64 }}
    >
      <svg viewBox="0 0 48 64" width="48" height="64" aria-hidden="true">
        <g transform={superior ? undefined : 'translate(0 64) scale(1 -1)'} strokeLinejoin="round" strokeLinecap="round">
          <path d={silueta.contorno} fill="var(--bg-card)" stroke="var(--text-muted)" strokeWidth="1.4" />
          <path d={silueta.cuello} fill="none" stroke="var(--text-muted)" strokeWidth="1" />
          {marca && <SimboloPieza marca={marca} silueta={silueta} />}
        </g>
        {marca?.hallazgo === 'PROTESIS_REMOVIBLE' && (
          <text x="24" y={superior ? 54 : 17} textAnchor="middle" fontWeight="800" fontSize="13"
            fill={COLOR_ESTADO[marca.estado]}>PR</text>
        )}
      </svg>
      {datos?.nota && (
        <NotebookPen size={12} aria-hidden="true" style={{ position: 'absolute', right: 0, top: superior ? 1 : 'auto', bottom: superior ? 'auto' : 1 }} />
      )}
      {detallePieza && <span hidden id={detalleId}>{detallePieza}</span>}
    </button>
  )

  return (
    <div style={{ width: 48, display: 'grid', justifyItems: 'center', gap: 2 }}>
      {superior && dibujo}
      <div style={{ position: 'relative', width: 48, height: 48 }}>
        {SECTORES.map(({ camino, x, y }, i) => {
          const cara = caras[i]
          const objetivo = { nivel: 'cara', fdi, cara } as const
          const marca = datos?.caras?.[cara]
          const detalle = descripcion(marca)
          const caraDetalleId = `${detalleId}-${cara}`
          return (
            <button
              key={cara}
              type="button"
              className="odontograma-control odontograma-cara"
              aria-disabled={seleccionar ? undefined : true}
              aria-haspopup={seleccionar ? 'dialog' : undefined}
              aria-label={ubicacion(objetivo)}
              aria-describedby={detalle ? caraDetalleId : undefined}
              title={detalle ?? ubicacion(objetivo)}
              onClick={seleccionar ? () => seleccionar(objetivo) : undefined}
              style={{ position: 'absolute', inset: 0, clipPath: `path('${camino}')` }}
            >
              <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
                <path d={camino} fill={marca ? COLOR_ESTADO[marca.estado] : 'var(--bg-card)'}
                  stroke="var(--text-muted)" strokeWidth="1.6" />
                <text x={x} y={y} fill={marca ? 'white' : 'var(--text-main)'} textAnchor="middle"
                  dominantBaseline="central" fontSize="9" fontWeight="700">{cara}</text>
              </svg>
              {detalle && <span hidden id={caraDetalleId}>{detalle}</span>}
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{fdi}</span>
      {!superior && dibujo}
    </div>
  )
}

function EditorMarca({ objetivo, estado, denticion, alGuardar, alCerrar }: {
  objetivo: Objetivo
  estado: EstadoOdontograma
  denticion: Denticion
  alGuardar: (marca: Marca | undefined, nota?: string) => void
  alCerrar: () => void
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const tituloId = useId()
  const pieza = objetivo.nivel === 'region' ? undefined : estado.piezas[objetivo.fdi]
  const region = objetivo.nivel === 'region' ? estado.regiones[objetivo.region] : undefined
  const actual = objetivo.nivel === 'cara' ? pieza?.caras?.[objetivo.cara] : region ?? pieza?.pieza
  const notaActual = objetivo.nivel === 'pieza' ? pieza?.nota : region?.nota
  const [hallazgo, setHallazgo] = useState<Hallazgo | ''>(actual?.hallazgo ?? '')
  const [estadoMarca, setEstadoMarca] = useState<EstadoMarca>(actual?.estado ?? 'PENDIENTE')
  const [nota, setNota] = useState(notaActual ?? '')
  const opciones = HALLAZGOS.filter(({ niveles }) => niveles.includes(objetivo.nivel))

  useEffect(() => {
    const elemento = dialogo.current
    if (elemento && !elemento.open) elemento.showModal()
  }, [])

  function guardar(marca: Marca | undefined, nota?: string) {
    dialogo.current?.close()
    alGuardar(marca, nota)
  }

  return (
    <dialog
      ref={dialogo}
      className="odontograma-dialogo"
      aria-labelledby={tituloId}
      onClose={alCerrar}
      style={{
        margin: 'auto', width: 'min(26rem, calc(100% - 2rem))', maxHeight: 'calc(100% - 2rem)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '1.25rem',
        background: 'var(--bg-card)', color: 'var(--text-main)', boxShadow: 'var(--shadow-lg)',
      }}
    >
      <h3 id={tituloId} style={{ marginBottom: '1rem' }}>{ubicacion(objetivo, denticion)}</h3>
      <label className="form-group">
        <span className="form-label">Hallazgo</span>
        <select className="form-input" value={hallazgo} onChange={(e) => setHallazgo(e.target.value as Hallazgo | '')}>
          <option value="" disabled={Boolean(actual)}>Seleccionar hallazgo</option>
          {opciones.map(({ codigo, etiqueta }) => <option key={codigo} value={codigo}>{etiqueta}</option>)}
        </select>
      </label>
      <label className="form-group">
        <span className="form-label">Estado</span>
        <select className="form-input" disabled={!hallazgo} value={estadoMarca} onChange={(e) => setEstadoMarca(e.target.value as EstadoMarca)}>
          <option value="PENDIENTE">Pendiente</option>
          <option value="REALIZADO">Realizado</option>
        </select>
      </label>
      {objetivo.nivel !== 'cara' && (
        <label className="form-group">
          <span className="form-label">Nota</span>
          <textarea className="form-input" rows={2} maxLength={500} value={nota}
            disabled={objetivo.nivel === 'region' && !hallazgo}
            onChange={(e) => setNota(e.target.value)} style={{ resize: 'vertical' }} />
        </label>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {actual && (
          <button type="button" className="btn btn-secondary" onClick={() => guardar(undefined, notaActual)}>
            <Trash2 size={16} aria-hidden="true" /> Quitar
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => dialogo.current?.close()}>Cancelar</button>
        <button type="button" className="btn btn-primary"
          disabled={!hallazgo && (objetivo.nivel !== 'pieza' || nota.trim() === (notaActual ?? ''))}
          onClick={() => guardar(hallazgo ? { hallazgo, estado: estadoMarca } : undefined, nota.trim() || undefined)}>
          <Check size={16} aria-hidden="true" /> Aplicar
        </button>
      </div>
    </dialog>
  )
}

const ANCHO_PIEZA = 48
const PADDING_PIEZAS = 4
// En pantallas táctiles muy angostas no se achica más: los dientes dejarían de poder tocarse
// y se usa el desplazamiento horizontal como último recurso.
const ESCALA_MINIMA = 0.6

/**
 * Escala (CSS zoom) para que la fila más larga de dientes quepa completa en el ancho disponible.
 * zoom, a diferencia de transform, también reduce el espacio que ocupa y los clip-path de las caras.
 */
function useEscalaParaCaber(piezasPorFila: number) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [valor, setValor] = useState(1)

  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento) return
    const natural = piezasPorFila * ANCHO_PIEZA + PADDING_PIEZAS * 2
    const medir = () => {
      const disponible = elemento.clientWidth
      if (disponible > 0) setValor(Math.max(ESCALA_MINIMA, Math.min(1, disponible / natural)))
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [piezasPorFila])

  return [contenedor, valor] as const
}

export default function Odontograma({ estado, denticion, onChange, onDenticionChange, soloLectura, mostrarLeyenda = true }: Props) {
  const regionDetalleId = useId()
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null)
  const editable = !soloLectura && Boolean(onChange)
  const seleccionar = editable ? setObjetivo : undefined
  const piezas = piezasDe(denticion)
  const arcadas = [
    { etiqueta: 'Arcada superior permanente', piezas: piezas.filter((fdi) => fdi < 50 && esSuperior(fdi)) },
    { etiqueta: 'Arcada superior temporal', piezas: piezas.filter((fdi) => fdi >= 50 && esSuperior(fdi)) },
    { etiqueta: 'Arcada inferior temporal', piezas: piezas.filter((fdi) => fdi >= 50 && !esSuperior(fdi)) },
    { etiqueta: 'Arcada inferior permanente', piezas: piezas.filter((fdi) => fdi < 50 && !esSuperior(fdi)) },
  ]
  const [contenedorPiezas, escala] = useEscalaParaCaber(Math.max(...arcadas.map((arcada) => arcada.piezas.length)))

  function guardar(marca: Marca | undefined, nota?: string) {
    if (!editable || !objetivo) return
    if (objetivo.nivel === 'region') {
      const regiones = { ...estado.regiones }
      if (marca) regiones[objetivo.region] = { ...marca, ...(nota ? { nota } : {}) }
      else delete regiones[objetivo.region]
      onChange?.({ ...estado, regiones })
    } else {
      const piezas = { ...estado.piezas }
      const pieza = { ...piezas[objetivo.fdi] }
      if (objetivo.nivel === 'cara') {
        const caras = { ...pieza.caras }
        if (marca) caras[objetivo.cara] = marca
        else delete caras[objetivo.cara]
        if (Object.keys(caras).length > 0) pieza.caras = caras
        else delete pieza.caras
      } else {
        if (marca) pieza.pieza = marca
        else delete pieza.pieza
        if (nota) pieza.nota = nota
        else delete pieza.nota
      }
      if (Object.keys(pieza).length > 0) piezas[objetivo.fdi] = pieza
      else delete piezas[objetivo.fdi]
      onChange?.({ ...estado, piezas })
    }
  }

  return (
    <section aria-label="Odontograma" style={{
      minWidth: 0, maxWidth: '100%', padding: '0.75rem', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', background: 'var(--bg-input)', display: 'grid', gap: '0.75rem',
    }}>
      <style>{`
        .odontograma-control { color: inherit; background: transparent; border: 0; padding: 0; }
        .odontograma-control:not([aria-disabled="true"]) { cursor: pointer; }
        .odontograma-control[aria-disabled="true"] { cursor: default; }
        .odontograma-control:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
        .odontograma-cara:not([aria-disabled="true"]):hover path,
        .odontograma-cara:focus-visible path { stroke: var(--primary); stroke-width: 4; }
        .odontograma-dialogo::backdrop { background: rgb(15 23 42 / 0.55); }
        .odontograma-dialogo button:disabled { opacity: 0.55; cursor: default; transform: none; }
      `}</style>
      {(mostrarLeyenda || (editable && onDenticionChange)) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        {editable && onDenticionChange && (
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="form-label">Dentición</span>
            <select className="form-input" style={{ padding: '0.4rem 0.6rem' }} value={denticion}
              onChange={(e) => onDenticionChange(e.target.value as Denticion)}>
              {Object.entries(DENTICIONES).map(([codigo, etiqueta]) => <option key={codigo} value={codigo}>{etiqueta}</option>)}
            </select>
          </label>
        )}
        {mostrarLeyenda && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem' }}>
          {(Object.keys(ESTADOS) as EstadoMarca[]).map((codigo) => (
            <span key={codigo} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: COLOR_ESTADO[codigo] }} />
              {ESTADOS[codigo]}
            </span>
          ))}
        </div>}
      </div>}

      <div ref={contenedorPiezas} role="region" aria-label="Piezas dentales" tabIndex={0}
        style={{ minWidth: 0, overflowX: 'auto', borderRadius: 'var(--radius-sm)' }}>
        <div style={{
          width: 'max-content', minWidth: '100%', display: 'grid', gap: '0.6rem', padding: `${PADDING_PIEZAS}px`,
          zoom: escala,
        }}>
          {arcadas.filter((arcada) => arcada.piezas.length > 0).map(({ etiqueta, piezas }) => (
            <div key={etiqueta} role="group" aria-label={etiqueta}
              style={{ display: 'flex', justifyContent: 'center' }}>
              {piezas.map((fdi) => (
                <Diente key={fdi} fdi={fdi} estado={estado} seleccionar={seleccionar} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Regiones dentales" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {REGIONES.map((region) => {
          const marca = estado.regiones[region]
          const detalle = descripcion(marca, marca?.nota)
          const detalleId = `${regionDetalleId}-${region}`
          const etiqueta = etiquetaRegion(region, denticion)
          return (
            <button key={region} type="button" aria-disabled={editable ? undefined : true}
              className="odontograma-control btn-secondary"
              aria-label={etiqueta} aria-describedby={detalle ? detalleId : undefined}
              aria-haspopup={editable ? 'dialog' : undefined}
              title={detalle ?? etiqueta} onClick={seleccionar ? () => seleccionar({ nivel: 'region', region }) : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem', font: 'inherit', fontSize: '0.8rem',
                padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)',
                border: `1px solid ${marca ? COLOR_ESTADO[marca.estado] : 'var(--border-color)'}`,
              }}>
              {etiqueta}
              {marca && <span>
                · {HALLAZGOS.find(({ codigo }) => codigo === marca.hallazgo)?.etiqueta}
              </span>}
              {detalle && <span hidden id={detalleId}>{detalle}</span>}
            </button>
          )
        })}
      </div>

      {editable && objetivo && (
        <EditorMarca objetivo={objetivo} estado={estado} denticion={denticion} alGuardar={guardar} alCerrar={() => setObjetivo(null)} />
      )}
    </section>
  )
}

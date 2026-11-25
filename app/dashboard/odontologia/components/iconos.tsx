// Íconos de odontología en SVG puro (sin 'use client'): los usan el odontograma interactivo, la
// pestaña del expediente, el historial de trabajos y el reporte impreso (componente de servidor).
import { COLOR_ESTADO, HALLAZGOS, type EstadoMarca, type Hallazgo } from '@/utils/odontograma'
import { siluetaDe } from './dientes'

type Silueta = ReturnType<typeof siluetaDe>

/** Símbolo de un hallazgo de pieza dibujado sobre la silueta (vista 48 × 64, raíces arriba). */
export function SimboloPieza({ hallazgo, color, silueta }: { hallazgo: Hallazgo; color: string; silueta: Silueta }) {
  switch (hallazgo) {
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

const NIVEL_CARA = new Set(HALLAZGOS.filter(({ niveles }) => niveles.includes('cara')).map(({ codigo }) => codigo))
const MOLAR = siluetaDe(16)

/**
 * Ícono pequeño de un hallazgo: el mismo símbolo que se dibuja en el diente (sobre un molar) o,
 * para hallazgos de cara, el círculo de 5 caras con la central rellena.
 */
export function IconoHallazgo({ hallazgo, estado, size = 20 }: { hallazgo: Hallazgo; estado?: EstadoMarca; size?: number }) {
  const color = estado ? COLOR_ESTADO[estado] : 'currentColor'
  const comun = { 'aria-hidden': true as const, style: { flexShrink: 0, verticalAlign: 'middle' } }

  if (NIVEL_CARA.has(hallazgo)) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--text-muted)" strokeWidth="1.4" {...comun}>
        <circle cx="12" cy="12" r="10" />
        <path d="M4.9 4.9 L8.5 8.5 M19.1 4.9 L15.5 8.5 M4.9 19.1 L8.5 15.5 M19.1 19.1 L15.5 15.5" />
        {hallazgo === 'FRACTURA'
          ? <path d="M7 6 L11 10 L9 13 L13 17 L12 19" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
          : <rect x="8.5" y="8.5" width="7" height="7" fill={color} stroke={color}
              strokeDasharray={hallazgo === 'SELLANTE' ? '2 1.5' : undefined} />}
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 64" width={size * 0.75} height={size} {...comun}>
      <g transform="translate(0 64) scale(1 -1)" strokeLinejoin="round" strokeLinecap="round">
        <path d={MOLAR.contorno} fill="none" stroke="var(--text-muted)" strokeWidth="2" />
        <SimboloPieza hallazgo={hallazgo} color={color} silueta={MOLAR} />
      </g>
      {hallazgo === 'PROTESIS_REMOVIBLE' && (
        <text x="24" y="20" textAnchor="middle" fontWeight="800" fontSize="16" fill={color}>PR</text>
      )}
    </svg>
  )
}

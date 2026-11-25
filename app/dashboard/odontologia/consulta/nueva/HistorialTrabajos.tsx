import { useId } from 'react'
import { History } from 'lucide-react'
import { formatDateTimeHN } from '@/utils/datetime'
import { doctorShortName } from '@/utils/doctorName'
import { etiquetaRegion, type Denticion, type TrabajoOdontologico } from '@/utils/odontograma'
import styles from './consultaDental.module.css'

export type TrabajosConsulta = {
  id: string
  fecha: string
  odontologo: { first_name: string | null; last_name: string | null; gender: string | null } | null
  procedimientos: string | null
  denticion: Denticion
  trabajos: TrabajoOdontologico[]
}

function ListaTrabajos({ trabajos, denticion }: { trabajos: TrabajoOdontologico[]; denticion: Denticion }) {
  if (!trabajos.length) return null

  return (
    <ul className={styles.listaTrabajos}>
      {trabajos.map((trabajo) => {
        const lugar = 'region' in trabajo
          ? etiquetaRegion(trabajo.region, denticion)
          : ['Pieza ' + trabajo.fdi, trabajo.superficie].filter(Boolean).join(' · ')
        return (
          <li key={lugar}>
            <span>{lugar}</span>
            <strong>{trabajo.etiqueta}</strong>
            {trabajo.nota && <span className={styles.muted}>{trabajo.nota}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function TrabajosAnteriores({ consultas }: { consultas: TrabajosConsulta[] }) {
  return consultas.map(({ id, fecha, odontologo, procedimientos, denticion, trabajos }) => (
    <div key={id} className={styles.trabajosConsulta}>
      <h4><time dateTime={fecha}>{formatDateTimeHN(fecha)}</time></h4>
      <p className={styles.muted}>
        {odontologo ? doctorShortName(odontologo.first_name, odontologo.last_name, odontologo.gender) : 'Odontólogo sin identificar'}
      </p>
      <ListaTrabajos trabajos={trabajos} denticion={denticion} />
      {procedimientos && <p className={styles.procedimientos}>{procedimientos}</p>}
      {!trabajos.length && !procedimientos && <p className={styles.muted}>Sin trabajos registrados.</p>}
    </div>
  ))
}

export default function HistorialTrabajos({ denticion, pendientes, consultas }: {
  denticion: Denticion
  pendientes: TrabajoOdontologico[]
  consultas: TrabajosConsulta[]
}) {
  const tituloId = useId()
  const limite = 10
  return (
    <aside className={`card ${styles.historialTrabajos}`} aria-labelledby={tituloId}>
      <h3 id={tituloId} className={styles.sectionTitle}><History size={18} /> Historial de trabajos</h3>
      <div className={styles.pendienteActual}>
        <h4>Pendiente actual</h4>
        <ListaTrabajos trabajos={pendientes} denticion={denticion} />
        {!pendientes.length && <p className={styles.muted}>Sin trabajos pendientes.</p>}
      </div>
      {consultas.length === 0 && <p className={styles.muted}>Primera consulta dental del paciente.</p>}
      <TrabajosAnteriores consultas={consultas.slice(0, limite)} />
      {consultas.length > limite && (
        <details className={styles.consulta}>
          <summary>Ver más</summary>
          <TrabajosAnteriores consultas={consultas.slice(limite)} />
        </details>
      )}
    </aside>
  )
}

import Odontograma from '@/app/dashboard/odontologia/components/Odontograma'
import type { cargarOdontograma } from './cargarOdontograma'

export default function PrintOdontograma({ odontograma }: {
  odontograma: Awaited<ReturnType<typeof cargarOdontograma>>
}) {
  return (
    <div className="section odontograma-impreso" id="odontograma">
      <h3 className="section-title">Odontograma</h3>
      {odontograma
        ? <Odontograma estado={odontograma.estado} denticion={odontograma.denticion} soloLectura ampliar={false} />
        : <p className="section-body">—</p>}
    </div>
  )
}

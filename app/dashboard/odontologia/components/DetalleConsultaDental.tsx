import type { ConsultaConTipo } from '@/utils/tipoConsulta'

export default function DetalleConsultaDental({ consulta }: {
  consulta: Pick<ConsultaConTipo, 'id' | 'intraoral_exam' | 'procedures_done'>
}) {
  return (
    <div>
      <dl style={{ margin: '0 0 0.5rem', display: 'grid', gap: '0.5rem' }}>
        {[
          ['Examen intraoral', consulta.intraoral_exam],
          ['Procedimientos realizados', consulta.procedures_done],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta}>
            <dt style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{etiqueta}</dt>
            <dd style={{ margin: 0, whiteSpace: 'pre-line' }}>{valor?.trim() || '—'}</dd>
          </div>
        ))}
      </dl>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <a href={`/consultations/${consulta.id}/print?doc=dental#odontograma`} target="_blank" rel="noopener noreferrer">
          Ver odontograma
        </a>
        <a href={`/consultations/${consulta.id}/print/plan-trabajo`} target="_blank" rel="noopener noreferrer">
          Imprimir reporte para el paciente
        </a>
      </div>
    </div>
  )
}

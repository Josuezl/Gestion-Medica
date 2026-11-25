import Link from 'next/link'
import { notFound } from 'next/navigation'
import { searchPatientsForAgenda } from '@/app/dashboard/patients/actions'
import { getSessionProfile } from '@/utils/session'
import { formatDateTimeHN } from '@/utils/datetime'
import { createClient } from '@/utils/supabase/server'

export default async function OdontologiaPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const session = await getSessionProfile()
  const profile = session?.profile
  if (!profile?.odontologia_habilitada || !profile.clinic_id) notFound()

  const { q } = await searchParams
  const busqueda = typeof q === 'string' ? q.trim() : ''
  const supabase = await createClient()
  const [recientes, pacientes] = await Promise.all([
    supabase.from('consultations')
      .select('id, patient_id, created_at, reason_for_visit, patients(first_name, last_name)')
      .eq('clinic_id', profile.clinic_id)
      .eq('tipo', 'DENTAL')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(20),
    busqueda ? searchPatientsForAgenda(busqueda) : [],
  ])

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <h1>Odontología</h1>

      <section className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        <h2>Buscar pacientes</h2>
        <form method="get" action="/dashboard/odontologia"
          style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: '0.75rem' }}>
          <label style={{ flex: '1 1 16rem' }}>
            <span className="form-label">Nombre, identidad o teléfono</span>
            <input className="form-input" type="search" name="q" defaultValue={busqueda} required />
          </label>
          <button className="btn btn-primary" type="submit">Buscar</button>
        </form>
        {busqueda && (pacientes.length > 0 ? (
          <ul style={{ display: 'grid', gap: '0.4rem', paddingLeft: '1.25rem' }}>
            {pacientes.map((paciente) => (
              <li key={paciente.id}>
                <Link href={`/dashboard/patients/${paciente.id}`}>{paciente.first_name} {paciente.last_name}</Link>
                {paciente.id_card && <> · {paciente.id_card}</>}
              </li>
            ))}
          </ul>
        ) : <p>No se encontraron pacientes.</p>)}
      </section>

      <section className="card" style={{ display: 'grid', gap: '0.75rem' }}>
        <h2>Consultas dentales recientes</h2>
        {recientes.error ? <p>No se pudieron cargar las consultas dentales.</p>
          : recientes.data.length === 0 ? <p>Todavía no hay consultas dentales.</p>
          : (
            <ul style={{ display: 'grid', gap: '0.75rem', paddingLeft: '1.25rem' }}>
              {recientes.data.map((consulta) => {
                const paciente = Array.isArray(consulta.patients) ? consulta.patients[0] : consulta.patients
                return (
                  <li key={consulta.id}>
                    <Link href={`/dashboard/patients/${consulta.patient_id}`}>
                      {paciente ? `${paciente.first_name} ${paciente.last_name}` : 'Expediente del paciente'}
                    </Link>
                    {' · '}{formatDateTimeHN(consulta.created_at)}
                    {consulta.reason_for_visit && <p>{consulta.reason_for_visit}</p>}
                  </li>
                )
              })}
            </ul>
          )}
      </section>
    </div>
  )
}

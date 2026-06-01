import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { Search, FileText, Eye, User, Calendar, Activity, ArrowRight } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function ConsultationsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const searchQuery = resolvedSearchParams.q || ''

  const supabase = await createClient()

  // 1. Obtener datos del médico logueado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  const clinicId = profile?.clinic_id

  // 2. Cargar consultas con joins a patients y user_profiles
  const { data: consultations, error } = await supabase
    .from('consultations')
    .select(`
      id,
      reason_for_visit,
      diagnosis,
      created_at,
      patients (
        id,
        first_name,
        last_name
      ),
      user_profiles (
        first_name,
        last_name
      )
    `)
    .eq('clinic_id', clinicId || '')
    .order('created_at', { ascending: false })

  // 3. Filtrar en memoria por búsqueda si existe (para buscar por paciente, diagnóstico o motivo)
  let filteredConsultations = consultations || []
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filteredConsultations = (consultations || []).filter((c: any) => {
      const patientName = c.patients ? `${c.patients.first_name} ${c.patients.last_name}`.toLowerCase() : ''
      const doctorName = c.user_profiles ? `${c.user_profiles.first_name} ${c.user_profiles.last_name}`.toLowerCase() : ''
      const diagnosis = c.diagnosis ? c.diagnosis.toLowerCase() : ''
      const reason = c.reason_for_visit ? c.reason_for_visit.toLowerCase() : ''
      return (
        patientName.includes(query) ||
        doctorName.includes(query) ||
        diagnosis.includes(query) ||
        reason.includes(query)
      )
    })
  }

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Header Row */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Consultas Médicas</h2>
          <p style={styles.subtitle}>Historial de consultas de evolución, diagnósticos y tratamientos de la clínica</p>
        </div>
        <a href="/dashboard/patients" className="btn btn-primary" style={{ gap: '0.5rem' }}>
          Nueva Consulta (Buscar Paciente)
          <ArrowRight size={18} />
        </a>
      </div>

      {/* Search Bar */}
      <div className="card" style={styles.searchCard}>
        <form method="GET" action="/dashboard/consultations" style={styles.searchForm}>
          <div style={styles.searchWrapper}>
            <Search size={18} style={styles.searchIcon} />
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por paciente, diagnóstico, médico o motivo..."
              style={styles.searchInput}
            />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem' }}>
            Buscar
          </button>
          {searchQuery && (
            <a href="/dashboard/consultations" className="btn btn-secondary" style={{ padding: '0.75rem' }}>
              Limpiar
            </a>
          )}
        </form>
      </div>

      {/* Consultations Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredConsultations.length === 0 ? (
          <div style={styles.emptyState}>
            <FileText size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <h3>No se encontraron consultas</h3>
            <p style={styles.emptySubtext}>
              {searchQuery
                ? 'Intenta con otros términos de búsqueda o limpia el filtro.'
                : 'Aún no se han registrado consultas médicas en esta clínica.'}
            </p>
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Paciente</th>
                  <th style={styles.th}>Motivo de Visita</th>
                  <th style={styles.th}>Diagnóstico</th>
                  <th style={styles.th}>Atendido Por</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsultations.map((consultation: any) => {
                  const date = new Date(consultation.created_at).toLocaleDateString('es-HN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                  const patientName = consultation.patients 
                    ? `${consultation.patients.first_name} ${consultation.patients.last_name}` 
                    : 'Paciente Desconocido'
                  const doctorName = consultation.user_profiles
                    ? `Dr. ${consultation.user_profiles.first_name} ${consultation.user_profiles.last_name}`
                    : 'Médico'

                  return (
                    <tr key={consultation.id} style={styles.tr}>
                      <td style={styles.td}>
                        <div style={styles.dateWrapper}>
                          <Calendar size={14} color="var(--text-muted)" />
                          <span style={styles.dateText}>{date}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.patientWrapper}>
                          <User size={14} color="var(--primary)" />
                          <span style={styles.patientText}>{patientName}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.reasonText} title={consultation.reason_for_visit}>
                          {consultation.reason_for_visit.length > 60 
                            ? `${consultation.reason_for_visit.substring(0, 60)}...` 
                            : consultation.reason_for_visit}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.diagnosisWrapper}>
                          <Activity size={14} color="var(--primary)" />
                          <span style={styles.diagnosisText}>{consultation.diagnosis}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.doctorText}>{doctorName}</span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>
                        {consultation.patients && (
                          <a
                            href={`/dashboard/patients/${consultation.patients.id}`}
                            className="btn btn-secondary"
                            style={styles.viewBtn}
                            title="Ver Expediente y Evolución"
                          >
                            <Eye size={15} />
                            <span>Expediente</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  searchCard: {
    padding: '1rem',
  },
  searchForm: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '1rem',
    color: 'var(--text-muted)',
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 1rem 0.75rem 2.75rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-main)',
    fontSize: '0.95rem',
  },
  emptyState: {
    padding: '4rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    justifyContent: 'center',
  },
  emptySubtext: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    maxWidth: '400px',
    marginTop: '0.5rem',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
  },
  thRow: {
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-input)',
  },
  th: {
    padding: '1rem 1.5rem',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    fontWeight: '700',
  },
  tr: {
    borderBottom: '1px solid var(--border-color)',
    transition: 'background-color var(--transition-fast)',
  },
  td: {
    padding: '1rem 1.5rem',
    verticalAlign: 'middle',
  },
  dateWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  dateText: {
    fontSize: '0.875rem',
    color: 'var(--text-main)',
  },
  patientWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  patientText: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: 'var(--text-main)',
  },
  reasonText: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
  },
  diagnosisWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  diagnosisText: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  doctorText: {
    fontSize: '0.875rem',
    color: 'var(--text-main)',
  },
  viewBtn: {
    padding: '0.4rem 0.8rem',
    fontSize: '0.75rem',
    gap: '0.25rem',
  },
}

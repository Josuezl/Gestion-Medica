import React from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { canDoClinical } from '@/utils/permissions'
import Pagination from '@/app/dashboard/components/Pagination'
import { doctorShortName } from '@/utils/doctorName'
import { formatDateTimeHN } from '@/utils/datetime'
import { sanitizeSearchTerm } from '@/utils/validation'
import { getSessionProfile } from '@/utils/session'
import { Search, FileText, Eye, User, Calendar, Activity, ArrowRight } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function ConsultationsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const qParam = resolvedSearchParams.q
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam) || ''
  
  const PAGE_SIZE = 10
  const pageParam = resolvedSearchParams.page
  const currentPage = parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) || '1', 10) || 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  // 1. Sesión + perfil memoizados por request (compartidos con el layout, P1-2)
  const session = await getSessionProfile()
  if (!session) return null
  const { profile } = session

  // El historial clínico es trabajo médico: asistente y enfermera no pueden verlo.
  if (!canDoClinical(profile?.role)) {
    redirect('/dashboard')
  }

  const clinicId = profile?.clinic_id

  // 2. Construir query de consultas con filtrado en el servidor
  let dbQuery = supabase
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
        last_name,
        gender
      )
    `, { count: 'exact' })
    .eq('clinic_id', clinicId || '')

  if (searchQuery) {
    // sanitizeSearchTerm: el texto se interpola en la sintaxis del filtro or() de PostgREST
    const safeQuery = sanitizeSearchTerm(searchQuery)
    const words = safeQuery.split(/\s+/).filter(Boolean)

    // Paso 1: buscar patient_ids que coincidan con el nombre (igual que la página de Pacientes)
    let patientQuery = supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId || '')
    words.forEach(word => {
      patientQuery = patientQuery.or(
        `first_name.ilike.%${word}%,last_name.ilike.%${word}%`
      )
    })
    const { data: matchingPatients } = await patientQuery.limit(200)
    const patientIds = (matchingPatients || []).map((p) => p.id)

    // Paso 2: filtrar consultas — por patient_id O por diagnóstico/motivo
    if (patientIds.length > 0) {
      dbQuery = dbQuery.or(
        `patient_id.in.(${patientIds.join(',')}),diagnosis.ilike.%${safeQuery}%,reason_for_visit.ilike.%${safeQuery}%`
      )
    } else {
      // No hubo coincidencias de paciente — buscar solo en diagnóstico/motivo
      dbQuery = dbQuery.or(
        `diagnosis.ilike.%${safeQuery}%,reason_for_visit.ilike.%${safeQuery}%`
      )
    }
  }

  // Paginación en el servidor — solo trae la página actual, no todo el historial
  const { data: consultations, count } = await dbQuery
    .order('created_at', { ascending: false })
    .range(from, to)

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1
  const paginatedConsultations = consultations || []

  return (
    <div style={styles.container}>
      {/* Header Row */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Consultas Médicas</h2>
          <p style={styles.subtitle}>Historial de consultas de evolución, diagnósticos y tratamientos de la clínica</p>
        </div>
        <Link href="/dashboard/patients" className="btn btn-primary" style={{ gap: '0.5rem' }}>
          Nueva Consulta (Buscar Paciente)
          <ArrowRight size={18} />
        </Link>
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
            <Link href="/dashboard/consultations" className="btn btn-secondary" style={{ padding: '0.75rem' }}>
              Limpiar
            </Link>
          )}
        </form>
      </div>

      {/* Consultations Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {paginatedConsultations.length === 0 ? (
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
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Motivo de Visita</th>
                  <th>Diagnóstico</th>
                  <th>Atendido Por</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedConsultations.map((consultation) => {
                  const date = formatDateTimeHN(consultation.created_at)
                  // Los joins patients(...)/user_profiles(...) son a-uno: llegan como objeto,
                  // aunque la inferencia del cliente diga arreglo.
                  const patientRef = consultation.patients as unknown as { id: string; first_name?: string | null; last_name?: string | null } | null
                  const doctorRef = consultation.user_profiles as unknown as { first_name?: string | null; last_name?: string | null; gender?: string | null } | null
                  const patientName = patientRef
                    ? `${patientRef.first_name} ${patientRef.last_name}`
                    : 'Paciente Desconocido'
                  const doctorName = doctorShortName(doctorRef?.first_name, doctorRef?.last_name, doctorRef?.gender)

                  return (
                    <tr key={consultation.id}>
                      <td data-label="Fecha">
                        <div style={styles.dateWrapper}>
                          <Calendar size={14} color="var(--text-muted)" />
                          <span style={styles.dateText}>{date}</span>
                        </div>
                      </td>
                      <td data-label="Paciente">
                        <div style={styles.patientWrapper}>
                          <User size={14} color="var(--primary)" />
                          <span style={styles.patientText}>{patientName}</span>
                        </div>
                      </td>
                      <td data-label="Motivo">
                        <span style={styles.reasonText} title={consultation.reason_for_visit}>
                          {consultation.reason_for_visit && consultation.reason_for_visit.length > 30
                            ? `${consultation.reason_for_visit.substring(0, 30)}...`
                            : (consultation.reason_for_visit || '-')}
                        </span>
                      </td>
                      <td data-label="Diagnóstico">
                        <div style={styles.diagnosisWrapper}>
                          <Activity size={14} color="var(--primary)" />
                          <span style={styles.diagnosisText}>{consultation.diagnosis}</span>
                        </div>
                      </td>
                      <td data-label="Atendido Por">
                        <span style={styles.doctorText}>{doctorName}</span>
                      </td>
                      <td data-label="Acciones" style={{ textAlign: 'right' }}>
                        {patientRef && (
                          <a
                            href={`/dashboard/patients/${patientRef.id}`}
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
            
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath="/dashboard/consultations"
              searchQuery={searchQuery}
            />
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
    backgroundColor: 'var(--bg-input)',
    boxShadow: 'none',
    border: '1px solid var(--border-color)',
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
    backgroundColor: '#ffffff',
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

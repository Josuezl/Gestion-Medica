import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { canDoClinical, canEnterVitals } from '@/utils/permissions'
import Pagination from '@/app/dashboard/components/Pagination'
import PatientVitalsButton from './PatientVitalsButton'
import { Search, Plus, User, Eye, Phone, Clipboard, Edit } from 'lucide-react'

// Calcular edad
function calculateAge(birthDateString: string) {
  const today = new Date()
  const birthDate = new Date(birthDateString)
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return age
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PatientsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const qParam = resolvedSearchParams.q
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam) || ''
  
  const PAGE_SIZE = 10
  const pageParam = resolvedSearchParams.page
  const currentPage = parseInt((Array.isArray(pageParam) ? pageParam[0] : pageParam) || '1', 10) || 1
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  
  const supabase = await createClient()

  // 1. Obtener datos del médico logueado
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  const clinicId = profile?.clinic_id
  // Asistente y enfermera no inician consultas: se oculta el botón por fila.
  const clinical = canDoClinical(profile?.role)
  // Enfermera (y médico/admin) pueden tomar signos sin entrar al expediente.
  const canVitals = canEnterVitals(profile?.role)

  // 2. Consultar pacientes en el servidor con filtrado si existe búsqueda
  let dbQuery = supabase
    .from('patients')
    .select('id, first_name, last_name, id_card, record_number, gender, birth_date, phone, blood_type, is_pediatric, dob_status', { count: 'exact' })
    .eq('clinic_id', clinicId || '')

  if (searchQuery) {
    // Dividir la búsqueda en palabras para soportar nombre completo
    // Ej: "Juan Carlos Vaquedano" → busca cada palabra en todos los campos (AND entre palabras, OR entre campos)
    const words = searchQuery.trim().split(/\s+/).filter(Boolean)
    words.forEach(word => {
      dbQuery = dbQuery.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,id_card.ilike.%${word}%,phone.ilike.%${word}%,record_number.ilike.%${word}%`)
    })
  }

  const { data: patients, count } = await dbQuery
    .order('first_name', { ascending: true })
    .range(from, to)

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1

  // Conteos para la cabecera: toda la clínica, independientes de la búsqueda/paginación.
  // Adultos = total − pediátricos (is_pediatric es booleano NOT NULL).
  const [{ count: totalPatients }, { count: pediatricPatients }] = await Promise.all([
    supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId || ''),
    supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId || '').eq('is_pediatric', true),
  ])
  const adultPatients = (totalPatients ?? 0) - (pediatricPatients ?? 0)

  return (
    <div style={styles.container}>
      {/* Header Row */}
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.title}>Expedientes de Pacientes</h2>
          <p style={styles.subtitle}>Busca, edita y gestiona las historias clínicas electrónicas</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', padding: '0.25rem 0.7rem', borderRadius: '999px', background: '#f1f5f9', color: '#0f172a', fontSize: '0.82rem', fontWeight: 600 }}>
              <strong>{(totalPatients ?? 0).toLocaleString('es-HN')}</strong> pacientes
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', padding: '0.25rem 0.7rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3', fontSize: '0.82rem', fontWeight: 600 }}>
              <strong>{adultPatients.toLocaleString('es-HN')}</strong> adultos
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', padding: '0.25rem 0.7rem', borderRadius: '999px', background: '#ccfbf1', color: '#0f766e', fontSize: '0.82rem', fontWeight: 600 }}>
              <strong>{(pediatricPatients ?? 0).toLocaleString('es-HN')}</strong> pediátricos
            </span>
          </div>
        </div>
        <a href="/dashboard/patients/new" className="btn btn-primary" style={{ gap: '0.5rem' }}>
          <Plus size={18} />
          Registrar Paciente
        </a>
      </div>

      {/* Search and Filters Bar */}
      <div className="card" style={styles.searchCard}>
        <form method="GET" action="/dashboard/patients" style={styles.searchForm}>
          <div style={styles.searchWrapper}>
            <Search size={18} style={styles.searchIcon} />
            <input
              type="text"
              name="q"
              defaultValue={searchQuery}
              placeholder="Buscar por nombre, identidad (DNI), teléfono..."
              style={styles.searchInput}
            />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem' }}>
            Buscar
          </button>
          {searchQuery && (
            <a href="/dashboard/patients" className="btn btn-secondary" style={{ padding: '0.75rem' }}>
              Limpiar
            </a>
          )}
        </form>
      </div>

      {/* Patients Table / List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {!patients || patients.length === 0 ? (
          <div style={styles.emptyState}>
            <User size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
            <h3>No se encontraron pacientes</h3>
            <p style={styles.emptySubtext}>
              {searchQuery 
                ? 'Intenta con otros términos de búsqueda o limpia el filtro.' 
                : 'Comienza registrando a tu primer paciente para ver su expediente clínico aquí.'}
            </p>
            {!searchQuery && (
              <a href="/dashboard/patients/new" className="btn btn-primary" style={{ marginTop: '1.25rem' }}>
                Registrar Primer Paciente
              </a>
            )}
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Identidad (DNI)</th>
                  <th>Edad / Género</th>
                  <th>Teléfono</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const patientName = `${patient.first_name} ${patient.last_name}`
                  const age = calculateAge(patient.birth_date)
                  
                  return (
                    <tr key={patient.id}>
                      <td data-label="Paciente">
                        <div style={styles.patientAvatarWrapper}>
                          <div style={styles.patientAvatar}>
                            {patient.first_name.charAt(0)}{patient.last_name.charAt(0)}
                          </div>
                          <div>
                            <p style={styles.patientNameText}>{patientName}</p>
                            <p style={styles.patientDetailSub}>ID: {patient.id.substring(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Identidad">
                        <span style={styles.idCardText}>{patient.id_card || 'No Registrado'}</span>
                      </td>
                      <td data-label="Edad / Género">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ ...styles.ageText, ...(patient.dob_status === 'unknown' ? { color: '#b45309' } : {}) }}>
                            {patient.dob_status === 'unknown' ? 'Sin fecha' : `${age} años`}
                          </span>
                          <span style={styles.genderSub}>
                            {patient.gender === 'M' ? 'Masculino' : patient.gender === 'F' ? 'Femenino' : patient.gender === 'O' ? 'Otro' : 'Sin especificar'}
                          </span>
                        </div>
                      </td>
                      <td data-label="Teléfono">
                        <div style={styles.phoneWrapper}>
                          <Phone size={14} color="var(--text-muted)" />
                          <span style={styles.phoneText}>{patient.phone}</span>
                        </div>
                      </td>
                      <td data-label="Acciones" style={{ textAlign: 'right' }}>
                        <div style={styles.actionButtons}>
                          {clinical && (
                            <a
                              href={`/dashboard/consultations/new?patientId=${patient.id}`}
                              className="btn btn-primary"
                              style={styles.consultBtn}
                              title="Iniciar Nueva Consulta"
                            >
                              <Clipboard size={15} />
                              <span>Consulta</span>
                            </a>
                          )}
                          <a
                            href={`/dashboard/patients/${patient.id}`}
                            className="btn btn-secondary"
                            style={styles.viewBtn}
                            title="Ver Expediente Completo"
                          >
                            <Eye size={15} />
                            <span>Expediente</span>
                          </a>
                          <a
                            href={`/dashboard/patients/${patient.id}?edit=true`}
                            className="btn btn-secondary"
                            style={styles.viewBtn}
                            title="Editar Información"
                          >
                            <Edit size={15} />
                            <span>Editar</span>
                          </a>
                          {canVitals && <PatientVitalsButton patient={patient} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath="/dashboard/patients"
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
  patientAvatarWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  patientAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary-light)',
    color: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '0.85rem',
    border: '1px solid rgba(13, 148, 136, 0.2)',
  },
  patientNameText: {
    fontSize: '0.925rem',
    fontWeight: '700',
  },
  patientDetailSub: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
  },
  idCardText: {
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    color: 'var(--text-main)',
  },
  ageText: {
    fontSize: '0.875rem',
    fontWeight: '600',
  },
  genderSub: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
  },
  phoneWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  phoneText: {
    fontSize: '0.875rem',
    color: 'var(--text-main)',
  },
  mutedText: {
    color: 'var(--text-muted)',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  viewBtn: {
    padding: '0.4rem 0.8rem',
    fontSize: '0.75rem',
    gap: '0.25rem',
  },
  consultBtn: {
    padding: '0.4rem 0.8rem',
    fontSize: '0.75rem',
    gap: '0.25rem',
  },
}

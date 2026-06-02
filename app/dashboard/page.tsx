import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { 
  Users, 
  Calendar as CalendarIcon, 
  FileText, 
  Clock, 
  TrendingUp,
  UserPlus
} from 'lucide-react'
import DashboardAgenda from './DashboardAgenda'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Obtener información del doctor autenticado para filtrar
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  const clinicId = profile?.clinic_id

  // 2. Ejecutar consultas de estadísticas
  // Pacientes Totales
  const { count: totalPatients } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId || '')

  // Consultas Totales
  const { count: totalConsultations } = await supabase
    .from('consultations')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId || '')

  // Citas de Hoy (GMT-6 Honduras Time)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const { count: todayAppointmentsCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId || '')
    .gte('scheduled_at', todayStart.toISOString())
    .lte('scheduled_at', todayEnd.toISOString())

  // Citas Pendientes Generales
  const { count: pendingAppointments } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', clinicId || '')
    .eq('status', 'PENDING')

  // 3. Cargar citas (rango amplio: 30 días atrás, 60 días adelante) para navegación
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - 30)
  rangeStart.setHours(0, 0, 0, 0)

  const rangeEnd = new Date()
  rangeEnd.setDate(rangeEnd.getDate() + 60)
  rangeEnd.setHours(23, 59, 59, 999)

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_at,
      status,
      notes,
      patients (
        id,
        first_name,
        last_name,
        birth_date,
        phone
      )
    `)
    .eq('clinic_id', clinicId || '')
    .gte('scheduled_at', rangeStart.toISOString())
    .lte('scheduled_at', rangeEnd.toISOString())
    .order('scheduled_at', { ascending: true })

  // 4. Cargar lista de pacientes para formulario de citas rápidas
  const { data: patientsList } = await supabase
    .from('patients')
    .select('id, first_name, last_name, phone')
    .eq('clinic_id', clinicId || '')
    .order('last_name', { ascending: true })

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Welcome Banner */}
      <section style={styles.banner}>
        <div style={styles.bannerContent}>
          <h3 style={styles.bannerTitle}>Gestión Médica más Simple & Segura</h3>
          <p style={styles.bannerText}>
            Usa el asistente conversacional para automatizar tus citas. Las recetas y resúmenes clínicos se enviarán directamente al WhatsApp de tus pacientes al terminar la consulta.
          </p>
        </div>
        <div style={styles.bannerBadge}>
          <TrendingUp size={24} color="#0d9488" />
          <span style={styles.bannerBadgeText}>100% HIPAA-Ready</span>
        </div>
      </section>

      {/* Stats Section */}
      <section className="responsive-stats-grid">
        <div className="card" style={styles.statCard}>
          <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(13, 148, 136, 0.1)' }}>
            <Users size={22} color="var(--primary)" />
          </div>
          <div>
            <p style={styles.statLabel}>Pacientes</p>
            <h3 style={styles.statValue}>{totalPatients || 0}</h3>
          </div>
        </div>

        <div className="card" style={styles.statCard}>
          <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(79, 70, 229, 0.1)' }}>
            <CalendarIcon size={22} color="var(--secondary)" />
          </div>
          <div>
            <p style={styles.statLabel}>Citas de Hoy</p>
            <h3 style={styles.statValue}>{todayAppointmentsCount || 0}</h3>
          </div>
        </div>

        <div className="card" style={styles.statCard}>
          <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <FileText size={22} color="#10b981" />
          </div>
          <div>
            <p style={styles.statLabel}>Consultas Realizadas</p>
            <h3 style={styles.statValue}>{totalConsultations || 0}</h3>
          </div>
        </div>

        <div className="card" style={styles.statCard}>
          <div style={{ ...styles.iconContainer, backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <Clock size={22} color="#f59e0b" />
          </div>
          <div>
            <p style={styles.statLabel}>Citas por Confirmar</p>
            <h3 style={styles.statValue}>{pendingAppointments || 0}</h3>
          </div>
        </div>
      </section>

      {/* Main Content Split Grid */}
      <div className="responsive-split-grid">
        {/* Interactive Agenda */}
        <DashboardAgenda
          appointments={appointments || []}
          patients={patientsList || []}
        />

        {/* Quick Actions Panel */}
        <div style={styles.sidePanel}>
          <div className="card" style={styles.actionsCard}>
            <h3 style={{ ...styles.sectionTitle, marginBottom: '1.25rem' }}>Acciones Rápidas</h3>
            <div style={styles.actionsList}>
              <a href="/dashboard/patients" style={styles.actionBtn}>
                <div style={{ ...styles.actionIconContainer, backgroundColor: 'rgba(13, 148, 136, 0.1)' }}>
                  <UserPlus size={18} color="var(--primary)" />
                </div>
                <div style={styles.actionDetails}>
                  <p style={styles.actionLabel}>Registrar Paciente</p>
                  <p style={styles.actionSub}>Crear nuevo expediente clínico</p>
                </div>
              </a>

              <a href="/dashboard/agenda" style={styles.actionBtn}>
                <div style={{ ...styles.actionIconContainer, backgroundColor: 'rgba(79, 70, 229, 0.1)' }}>
                  <CalendarIcon size={18} color="var(--secondary)" />
                </div>
                <div style={styles.actionDetails}>
                  <p style={styles.actionLabel}>Agenda Completa</p>
                  <p style={styles.actionSub}>Ver disponibilidad y agendar manual</p>
                </div>
              </a>

              <a href="/dashboard/consultations" style={styles.actionBtn}>
                <div style={{ ...styles.actionIconContainer, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                  <FileText size={18} color="#10b981" />
                </div>
                <div style={styles.actionDetails}>
                  <p style={styles.actionLabel}>Historial de Consultas</p>
                  <p style={styles.actionSub}>Buscar evolución y recetas pasadas</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  banner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.05) 0%, rgba(79, 70, 229, 0.05) 100%)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.5rem 2rem',
    gap: '2rem',
    flexWrap: 'wrap',
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: 'var(--primary)',
    marginBottom: '0.25rem',
  },
  bannerText: {
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
  },
  bannerBadge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'var(--bg-card)',
    padding: '0.75rem 1.25rem',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    boxShadow: 'var(--shadow-sm)',
    minWidth: '130px',
  },
  bannerBadgeText: {
    fontSize: '0.75rem',
    fontWeight: '800',
    color: 'var(--primary)',
    marginTop: '0.25rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1.5rem',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
  },
  iconContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
    lineHeight: '1.2',
  },
  splitGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '1.5rem',
  },
  appointmentListContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-color)',
    paddingBottom: '1rem',
    marginBottom: '1rem',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
  },
  listWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem 1.5rem',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
  },
  appointmentRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    backgroundColor: 'var(--bg-input)',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    gap: '1.5rem',
    transition: 'border-color var(--transition-fast)',
    flexWrap: 'wrap',
  },
  appointmentTimeWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRight: '1px solid var(--border-color)',
    paddingRight: '1.25rem',
    minWidth: '85px',
  },
  appointmentTime: {
    fontSize: '0.95rem',
    fontWeight: '700',
    color: 'var(--primary)',
  },
  appointmentTimeSub: {
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  patientDetails: {
    flex: 1,
  },
  patientName: {
    fontSize: '0.95rem',
    fontWeight: '700',
  },
  patientSub: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  sidePanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  actionsCard: {
    padding: '1.5rem',
  },
  actionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.85rem',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all var(--transition-fast)',
  },
  actionIconContainer: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDetails: {
    flex: 1,
  },
  actionLabel: {
    fontSize: '0.85rem',
    fontWeight: '700',
    color: 'var(--text-main)',
  },
  actionSub: {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
  },
}

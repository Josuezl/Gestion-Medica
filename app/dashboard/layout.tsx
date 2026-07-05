import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/utils/session'
import SidebarLink from './components/SidebarLink'
import { redirect } from 'next/navigation'
import { logout } from '../auth/actions'
import { personShortName } from '@/utils/doctorName'
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  User as UserIcon,
  BarChart3,
  Menu,
  Inbox,
  Globe,
  BookOpen
} from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Sesión + perfil memoizados por request: layout, página y greeting comparten la llamada (P1-2).
  const session = await getSessionProfile()
  if (!session) {
    redirect('/login')
  }
  const { profile } = session

  const supabase = await createClient()
  const clinicName = profile?.clinic_name || 'Mi Consultorio'
  const doctorName = profile ? personShortName(profile.first_name, profile.last_name) : 'Médico'
  const specialty = profile?.specialty || 'General'

  // Solicitudes del portal público pendientes de aprobar (RLS ya acota a la clínica del usuario).
  const { count: pendingBookings } = await supabase
    .from('booking_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'PENDING')

  // Derived UI Role
  let displayRole = 'Asistente'
  if (profile?.role === 'DOCTOR') {
    displayRole = profile.is_org_admin ? 'Médico (Administrador)' : 'Médico'
  } else if (profile?.role === 'ADMIN') {
    displayRole = 'Administrador'
  } else if (profile?.role === 'NURSE') {
    displayRole = 'Auxiliar de Enfermería'
  }

  return (
    <div className="dashboard-container">
      {/* Checkbox toggle and overlay for mobile menu */}
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle-checkbox" />
      <label htmlFor="sidebar-toggle" className="sidebar-overlay"></label>

      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div style={styles.logoContainer}>
          <div>
            <h1 style={styles.logoText}>CloudMedHN</h1>
            <p style={styles.logoSubtext}>{clinicName}</p>
          </div>
        </div>

        <nav style={styles.navigation}>
          <SidebarLink href="/dashboard" label="Dashboard" icon={<LayoutDashboard size={20} />} />
          <SidebarLink href="/dashboard/patients" label="Pacientes" icon={<Users size={20} />} />
          {/* Auto-agendamiento: lo gestiona todo el personal (asistentes, médicos y enfermería) */}
          <SidebarLink href="/dashboard/agenda-publica" label="Agenda en línea" icon={<Globe size={20} />} />
          <SidebarLink href="/dashboard/solicitudes" label="Aprobación de Citas" icon={<Inbox size={20} />} badge={pendingBookings || 0} />
          {(profile?.role === 'ADMIN' || profile?.role === 'DOCTOR') && (
            <SidebarLink href="/dashboard/consultations" label="Historial de Consultas" icon={<FileText size={20} />} />
          )}
          <SidebarLink href="/dashboard/reports" label="Reportes" icon={<BarChart3 size={20} />} />
          {profile?.is_org_admin && (
            <SidebarLink href="/dashboard/catalogos" label="Catálogos Lab/estudios" icon={<BookOpen size={20} />} />
          )}
          <SidebarLink href="/dashboard/profile" label="Mi Perfil" icon={<UserIcon size={20} />} />
          {profile?.is_org_admin && (
            <SidebarLink href="/dashboard/config" label="Configuración" icon={<Settings size={20} />} />
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.doctorInfoCard}>
            <div style={styles.doctorTextDetails}>
              <p style={{ ...styles.doctorNameText, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {doctorName}
                <span style={{ 
                  fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: '4px', 
                  backgroundColor: 'rgba(255,255,255,0.1)', color: '#94a3b8' 
                }}>
                  {displayRole}
                </span>
              </p>
              <p style={styles.doctorSpecialtyText}>{specialty}</p>
            </div>
          </div>
          
          <form action={logout}>
            <button type="submit" style={styles.logoutButton}>
              <LogOut size={18} />
              <span>Cerrar Sesión</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="dashboard-main-panel">
        {/* Dynamic page contents */}
        <main className="dashboard-content">
          <label htmlFor="sidebar-toggle" className="sidebar-toggle-label" style={{ marginBottom: '1rem', alignSelf: 'flex-start' }}>
            <Menu size={20} />
          </label>
          {children}
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2.5rem',
    paddingBottom: '1.25rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logoText: {
    fontSize: '1.25rem',
    fontWeight: '800',
    color: '#fff',
    lineHeight: '1.2',
  },
  logoSubtext: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '210px',
  },
  navigation: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flex: 1,
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    paddingTop: '1.25rem',
  },
  doctorInfoCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: '0.75rem',
    borderRadius: '10px',
    marginBottom: '1rem',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  doctorTextDetails: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  doctorNameText: {
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  doctorSpecialtyText: {
    fontSize: '0.7rem',
    color: '#94a3b8',
    lineHeight: '1.3',
  },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.75rem',
    backgroundColor: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.875rem',
    transition: 'all var(--transition-fast)',
  },
}

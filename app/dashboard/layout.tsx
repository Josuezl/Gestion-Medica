import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '../auth/actions'
import { personShortName, firstWord } from '@/utils/doctorName'
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  FileText, 
  Settings,
  LogOut,
  Stethoscope,
  User as UserIcon,
  MessageSquare,
  BarChart3,
  Menu
} from 'lucide-react'

interface SidebarLinkProps {
  href: string
  label: string
  icon: React.ReactNode
}

function SidebarLink({ href, label, icon }: SidebarLinkProps) {
  return (
    <a href={href} style={styles.sidebarLink}>
      {icon}
      <span>{label}</span>
    </a>
  )
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // 1. Obtener la sesión del usuario
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 2. Cargar perfil del médico y clínica
  const { data: profile } = await supabase
    .from('user_profiles')
    .select(`
      first_name,
      last_name,
      role,
      is_org_admin,
      specialty,
      clinics (
        name
      )
    `)
    .eq('id', user.id)
    .single()

  const clinicName = (profile?.clinics as any)?.name || 'Mi Consultorio'
  const doctorName = profile ? personShortName(profile.first_name, profile.last_name) : 'Médico'
  const specialty = profile?.specialty || 'General'

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
          <div style={styles.logoIcon}>
            <img src="/Logo%20de%20Honduras.png" alt="CloudMedHN" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          </div>
          <div>
            <h1 style={styles.logoText}>CloudMedHN</h1>
            <p style={styles.logoSubtext}>{clinicName}</p>
          </div>
        </div>

        <nav style={styles.navigation}>
          <SidebarLink href="/dashboard" label="Dashboard" icon={<LayoutDashboard size={20} />} />
          <SidebarLink href="/dashboard/patients" label="Pacientes" icon={<Users size={20} />} />
          {(profile?.role === 'ADMIN' || profile?.role === 'DOCTOR') && (
            <SidebarLink href="/dashboard/consultations" label="Historial de Consultas" icon={<FileText size={20} />} />
          )}
          <SidebarLink href="/dashboard/reports" label="Reportes" icon={<BarChart3 size={20} />} />
          {profile?.is_org_admin && (
            <SidebarLink href="/dashboard/config" label="Configuración" icon={<Settings size={20} />} />
          )}
          <SidebarLink href="/dashboard/profile" label="Usuario" icon={<UserIcon size={20} />} />
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
  container: {
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: 'var(--bg-main)',
  },
  sidebar: {
    width: '280px',
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
    color: '#fff',
    padding: '1.5rem',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '2.5rem',
    paddingBottom: '1.25rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  logoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  sidebarLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: '0.925rem',
    fontWeight: '500',
    borderRadius: '8px',
    transition: 'all var(--transition-fast)',
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
  avatarIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'var(--primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  mainPanel: {
    flex: 1,
    marginLeft: '280px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    height: '80px',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2rem',
    position: 'sticky',
    top: 0,
    zIndex: 9,
  },
  headerTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  whatsappBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    padding: '0.4rem 0.8rem',
    borderRadius: '20px',
  },
  whatsappBadgeText: {
    fontSize: '0.75rem',
    color: '#10b981',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: '2rem',
  },
}

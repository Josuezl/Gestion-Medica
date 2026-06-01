import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '../auth/actions'
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
      specialty,
      clinics (
        name
      )
    `)
    .eq('id', user.id)
    .single()

  const doctorName = profile ? `Dr. ${profile.first_name} ${profile.last_name}` : 'Médico'
  const clinicName = profile?.clinics ? (profile.clinics as any).name : 'Mi Clínica'
  const specialty = profile?.specialty || 'General'

  return (
    <div className="dashboard-container">
      {/* Checkbox toggle and overlay for mobile menu */}
      <input type="checkbox" id="sidebar-toggle" className="sidebar-toggle-checkbox" />
      <label htmlFor="sidebar-toggle" className="sidebar-overlay"></label>

      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div style={styles.logoContainer}>
          <div style={styles.logoIcon}>
            <Stethoscope size={24} color="#2dd4bf" />
          </div>
          <div>
            <h1 style={styles.logoText}>MedConnect</h1>
            <p style={styles.logoSubtext}>{clinicName}</p>
          </div>
        </div>

        <nav style={styles.navigation}>
          <SidebarLink href="/dashboard" label="Dashboard" icon={<LayoutDashboard size={20} />} />
          <SidebarLink href="/dashboard/patients" label="Pacientes" icon={<Users size={20} />} />
          <SidebarLink href="/dashboard/agenda" label="Agenda de Citas" icon={<Calendar size={20} />} />
          <SidebarLink href="/dashboard/consultations" label="Consultas" icon={<FileText size={20} />} />
          <SidebarLink href="/dashboard/config" label="Configuración" icon={<Settings size={20} />} />
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.doctorInfoCard}>
            <div style={styles.avatarIcon}>
              <UserIcon size={18} color="#fff" />
            </div>
            <div style={styles.doctorTextDetails}>
              <p style={styles.doctorNameText}>{doctorName}</p>
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
        {/* Header */}
        <header className="dashboard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Hamburger button visible only on mobile */}
            <label htmlFor="sidebar-toggle" className="sidebar-toggle-label">
              <Menu size={20} />
            </label>
            <div>
              <h2 style={styles.headerTitle}>Panel de Control</h2>
              <p style={styles.headerSubtitle}>Bienvenido de vuelta, gestiona tu consultorio hoy</p>
            </div>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.whatsappBadge}>
              <MessageSquare size={16} color="#10b981" />
              <span style={styles.whatsappBadgeText}>WhatsApp Bot Activo</span>
            </div>
          </div>
        </header>

        {/* Dynamic page contents */}
        <main className="dashboard-content">
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
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(45, 212, 191, 0.2)',
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
    maxWidth: '180px',
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
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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

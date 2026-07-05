'use client'

import React from 'react'
import Link from 'next/link'

interface SidebarLinkProps {
  href: string
  label: string
  icon: React.ReactNode
  badge?: number
}

/**
 * Enlace del sidebar con navegación cliente (next/link): evita la recarga completa
 * de página que re-ejecutaba middleware + queries del layout en cada clic (P1-1).
 * Al navegar sin recarga, el menú móvil (checkbox #sidebar-toggle) ya no se cierra
 * solo: se desmarca explícitamente en el onClick.
 */
export default function SidebarLink({ href, label, icon, badge }: SidebarLinkProps) {
  const closeMobileSidebar = () => {
    const toggle = document.getElementById('sidebar-toggle')
    if (toggle instanceof HTMLInputElement) toggle.checked = false
  }

  return (
    <Link href={href} style={styles.sidebarLink} onClick={closeMobileSidebar}>
      {icon}
      <span>{label}</span>
      {!!badge && (
        <span style={{
          marginLeft: 'auto', backgroundColor: '#a855f7', color: '#fff', fontSize: '0.7rem',
          fontWeight: 700, borderRadius: '999px', padding: '0.1rem 0.45rem', minWidth: '1.2rem', textAlign: 'center',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

const styles: Record<string, React.CSSProperties> = {
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
}

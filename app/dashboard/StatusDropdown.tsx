'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Configuración visual de los estados de una cita (etiqueta, colores, clase CSS).
 * Fuente única compartida por AgendaClient y StatusDropdown — extraído sin cambios.
 */
export const STATUS_CONFIG: Record<string, { label: string, color: string, dotColor: string, class: string }> = {
  PENDING: { label: 'Pendiente', color: '#f3f4f6', dotColor: '#9ca3af', class: 'status-pending' },
  CANCELLED: { label: 'Cancelada', color: '#fee2e2', dotColor: '#ef4444', class: 'status-cancelled' },
  CONFIRMED: { label: 'Confirmada', color: '#dcfce7', dotColor: '#22c55e', class: 'status-confirmed' },
  NO_SHOW: { label: 'No se presento', color: '#f3f4f6', dotColor: '#6b7280', class: 'status-no-show' },
  WAITING: { label: 'En sala de espera', color: '#fef3c7', dotColor: '#f59e0b', class: 'status-waiting' },
  IN_PROGRESS: { label: 'En consulta', color: '#dbeafe', dotColor: '#3b82f6', class: 'status-in-progress' },
  COMPLETED: { label: 'Realizada', color: '#d1fae5', dotColor: '#10b981', class: 'status-completed' },
}

/**
 * Selector desplegable del estado de una cita. Componente presentacional con estado de apertura propio.
 * `variant`:
 *   - 'default': disparador con borde blanco (estilo selector clásico).
 *   - 'badge': pastilla coloreada con el color del estado (para la tarjeta de cita rediseñada).
 */
export default function StatusDropdown({ status, onChange, variant = 'default' }: { status: string, onChange: (newStatus: string) => void, variant?: 'default' | 'badge' }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const current = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="status-dropdown-container" ref={dropdownRef}>
      {variant === 'badge' ? (
        <button
          type="button"
          className="status-badge-trigger"
          style={{ backgroundColor: current.color, color: current.dotColor }}
          onClick={() => setOpen(!open)}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: current.dotColor }}></span>
          {current.label}
        </button>
      ) : (
        <div
          className="status-dropdown-trigger"
          onClick={() => setOpen(!open)}
        >
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: current.dotColor, border: '1px solid rgba(0,0,0,0.1)' }}></div>
          {current.label}
          <ChevronDown size={14} color="#94a3b8" style={{ marginLeft: '1px', flexShrink: 0 }} />
        </div>
      )}
      {open && (
        <div className="status-dropdown-menu">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              className={`status-dropdown-item ${status === key ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange(key)
                setOpen(false)
              }}
            >
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: config.dotColor, border: '1px solid rgba(0,0,0,0.1)' }}></div>
              {config.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

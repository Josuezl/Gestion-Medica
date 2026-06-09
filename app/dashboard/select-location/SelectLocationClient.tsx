'use client'

import React, { useState } from 'react'
import { setSessionLocation } from './actions'
import { MapPin, ArrowRight } from 'lucide-react'

interface Location {
  id: string
  name: string
  address: string | null
}

export default function SelectLocationClient({ locations }: { locations: Location[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleSelect(id: string) {
    setLoadingId(id)
    await setSessionLocation(id)
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {locations.map(loc => (
        <button
          key={loc.id}
          onClick={() => handleSelect(loc.id)}
          disabled={loadingId !== null}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.5rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            cursor: loadingId ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            textAlign: 'left',
            opacity: loadingId && loadingId !== loc.id ? 0.5 : 1
          }}
          className="location-card-hover"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ backgroundColor: '#f0fdfa', padding: '0.75rem', borderRadius: '50%' }}>
              <MapPin size={24} color="#0d9488" />
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.25rem', color: '#0f172a' }}>{loc.name}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                {loc.address || 'Sin dirección registrada'}
              </p>
            </div>
          </div>
          
          <div style={{ color: loadingId === loc.id ? '#0d9488' : '#cbd5e1' }}>
            {loadingId === loc.id ? (
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Entrando...</span>
            ) : (
              <ArrowRight size={24} />
            )}
          </div>
        </button>
      ))}
      <style>{`
        .location-card-hover:hover {
          border-color: #0d9488 !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
        }
      `}</style>
    </div>
  )
}

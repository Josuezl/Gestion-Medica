'use client'

import React from 'react'
import { ExternalLink, Pill, Store } from 'lucide-react'
import type { PrescriptionRow } from '@/utils/clinicalTypes'
import { medicinesToText } from '@/utils/medicines'
import { autoCrecer } from '@/utils/autoCrecer'
import { ReferenciaAnterior } from './DiagnosticoCampos'

// Enlaces a farmacias de Honduras junto a la receta (consulta de existencias y precios).
const FARMACIAS = [
  { nombre: 'Del Ahorro', url: 'https://www.farmaciasdelahorro.hn/' },
  { nombre: 'Simán', url: 'https://www.farmaciasiman.com/' },
  { nombre: 'Kielsa', url: 'https://kielsa.com/' },
]

/**
 * En escritorio la farmacia se abre en una ventana aparte, al costado, para ver la consulta y la
 * farmacia a la vez (no en un modal: Simán prohíbe mostrarse dentro de otra página). Se corta el
 * vínculo con la consulta (`opener`) para que la página externa no pueda redirigirla; por eso cada
 * clic abre su propia ventana (el navegador no deja reutilizarla sin ese vínculo). En teléfono, o si
 * el navegador bloquea la ventana, sigue el enlace normal (pestaña nueva).
 */
function abrirFarmacia(e: React.MouseEvent<HTMLAnchorElement>, url: string) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return // el médico pidió pestaña/ventana a su manera
  if (!window.matchMedia('(min-width: 1000px) and (pointer: fine)').matches) return
  const ancho = Math.min(1000, window.screen.availWidth)
  const alto = Math.min(800, window.screen.availHeight)
  const izquierda = window.screenX + window.outerWidth - ancho
  const arriba = window.screenY + 60
  // En blanco primero (mismo origen) para poder cortar `opener` y saber si el navegador la bloqueó.
  const ventana = window.open('', '_blank', `popup,width=${ancho},height=${alto},left=${izquierda},top=${arriba}`)
  if (!ventana) return // ventana bloqueada: el enlace abre la pestaña de siempre
  e.preventDefault()
  ventana.opener = null
  ventana.location.href = url
}

interface RecetaConsultaProps {
  lastPrescription?: PrescriptionRow
  medicinesText: string
  setMedicinesText: (value: string) => void
  prescriptionNotes: string
  setPrescriptionNotes: (value: string) => void
  includeDiagnosis: boolean
  setIncludeDiagnosis: (value: boolean) => void
}

export default function RecetaConsulta({
  lastPrescription,
  medicinesText,
  setMedicinesText,
  prescriptionNotes,
  setPrescriptionNotes,
  includeDiagnosis,
  setIncludeDiagnosis,
}: RecetaConsultaProps) {
  // Cargar los medicamentos (y notas) de la última receta del paciente al textarea.
  function loadLastPrescription() {
    if (!lastPrescription) return
    setMedicinesText(medicinesToText(lastPrescription.medicines || []))
    if (lastPrescription.notes) setPrescriptionNotes(lastPrescription.notes)
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={sectionTitle}>
        <Pill size={18} color="var(--secondary)" />
        Prescribir Receta Médica
      </h3>

      {/* Medicamentos en TEXTO LIBRE (un medicamento por línea), con la última receta a la par. */}
      <div className="dx-layout">
        <div className="dx-campo">
          <div className="dx-campo-cabecera">
            <label htmlFor="receta-medicamentos" className="evo-label">Medicamentos</label>
          </div>
          <textarea
            id="receta-medicamentos"
            className="form-input auto-crece"
            value={medicinesText}
            onChange={(e) => setMedicinesText(e.target.value)}
            onInput={autoCrecer}
            placeholder={`Escribe un medicamento por línea. Ejemplo:\nCARDIOASPIRINA 81 MG VO CADA DIA. 12 MD\nLIPITOR 40 MG VO CADA DIA. 6 PM\nEUTIROX NF 50 MCG VO 1 TABLETA CADA DIA, EN AYUNO`}
            rows={9}
          />
        </div>
        {/* Farmacias a la altura de la etiqueta; la última receta, a la altura del cuadro. */}
        <div className="receta-lado">
          <div className="farmacias">
            <span className="farmacias-titulo"><Store size={20} aria-hidden="true" /> Farmacias</span>
            {FARMACIAS.map((f) => (
              <a key={f.nombre} href={f.url} target="_blank" rel="noopener noreferrer" className="farmacia-enlace" onClick={(e) => abrirFarmacia(e, f.url)}>
                {f.nombre} <ExternalLink size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
          <ReferenciaAnterior
            titulo="Última receta"
            fecha={lastPrescription?.created_at}
            valor={lastPrescription
              ? [medicinesToText(lastPrescription.medicines || []), lastPrescription.notes ? `Notas: ${lastPrescription.notes}` : '']
                  .filter(Boolean).join('\n\n')
              : null}
            onUsar={loadLastPrescription}
          />
        </div>
      </div>
      <p style={{ margin: "0.4rem 0 1rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
        Un medicamento por línea (nombre, dosis, frecuencia, duración). Se numeran solos en la receta.
      </p>

      {/* Indicaciones de la receta */}
      <div className="form-group" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <label className="form-label">Notas Adicionales de la Receta</label>
        <textarea
          className="form-input"
          name="prescription_notes"
          value={prescriptionNotes}
          onChange={(e) => setPrescriptionNotes(e.target.value)}
          placeholder="Indicaciones adicionales de toma o advertencias..."
          rows={2}
        />
      </div>

      {/* Incluir el diagnóstico de la consulta en la receta (opcional) */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginTop: '0.75rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          name="include_diagnosis"
          checked={includeDiagnosis}
          onChange={(e) => setIncludeDiagnosis(e.target.checked)}
          style={{ marginTop: '0.2rem', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
        />
        <span>
          <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>Incluir el diagnóstico de la consulta en la receta</span>
          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Algunas aseguradoras lo requieren.</span>
        </span>
      </label>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: '700',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '1.25rem',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '0.5rem',
}

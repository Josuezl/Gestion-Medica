'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope } from 'lucide-react'
import PreclinicalVitalsModal from '@/app/dashboard/components/PreclinicalVitalsModal'

/**
 * Botón "Tomar signos" para la lista de pacientes: abre la pre-clínica (signos vitales) del
 * paciente sin entrar al expediente. Pensado para que la enfermera busque por nombre y registre
 * en un clic. Solo se monta para roles con canEnterVitals (enfermera/médico/admin).
 */
export default function PatientVitalsButton({ patient }: { patient: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary"
        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', gap: '0.25rem', display: 'inline-flex', alignItems: 'center', backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}
        title="Tomar signos vitales (pre-clínica)"
      >
        <Stethoscope size={15} />
        <span>Tomar signos</span>
      </button>
      {open && (
        <PreclinicalVitalsModal
          patient={patient}
          appointmentId={null}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  )
}

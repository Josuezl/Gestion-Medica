'use client'

import React from 'react'
import { X, Lock, Zap, Send } from 'lucide-react'
import { doctorShortName } from '@/utils/doctorName'

/**
 * Modal para compartir un documento por WhatsApp.
 * - `prescription`: dos opciones (enlace seguro con código vs enlace directo) a /prescriptions/view/{id}.
 * - `laborder` / `incapacidad`: una sola opción que comparte el enlace público verificable
 *   `/verificar/{código}` (mismo destino que el QR impreso).
 * Componente presentacional compartido por PatientHistoryTabs y PatientDetailsClient (dedup B1).
 */
export default function WhatsAppShareModal({ presc, patient, appUrl, onClose, docType = 'prescription' }: {
  presc: any
  patient: any
  appUrl: string
  onClose: () => void
  docType?: 'prescription' | 'laborder' | 'incapacidad' | 'referral' | 'studyrequest'
}) {
  if (!presc) return null

  const docName = doctorShortName(presc.user_profiles?.first_name, presc.user_profiles?.last_name, presc.user_profiles?.gender)
  const patientPhoneClean = patient.phone ? patient.phone.replace(/\D/g, '') : ''
  const openWhatsApp = (text: string) => {
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${patientPhoneClean}&text=${encodeURIComponent(text)}`
    window.open(whatsappUrl, '_blank', 'noreferrer')
    onClose()
  }

  // Enlace al DOCUMENTO con membrete (el paciente lo ve y toca "Descargar / Imprimir"). Por tipo.
  const docLink = docType === 'laborder'
    ? `${appUrl}/lab-orders/${presc.id}/print?code=${presc.verification_code}`
    : docType === 'incapacidad'
      ? `${appUrl}/consultations/${presc.id}/print?code=${presc.verification_code}`
      : docType === 'referral'
        ? `${appUrl}/consultations/${presc.id}/print?code=${presc.verification_code}&doc=referral`
        : docType === 'studyrequest'
          ? `${appUrl}/study-requests/${presc.id}/print?code=${presc.verification_code}`
          : `${appUrl}/verificar/${presc.verification_code}`

  // Texto descriptivo del documento según el tipo.
  const docNoun = docType === 'laborder'
    ? 'la siguiente orden de laboratorio'
    : docType === 'incapacidad'
      ? 'su incapacidad médica'
      : docType === 'referral'
        ? 'su referencia médica'
        : docType === 'studyrequest'
          ? 'la siguiente solicitud de estudios'
          : 'la siguiente receta médica'

  const docLabel = docType === 'laborder' ? 'orden de laboratorio' : docType === 'referral' ? 'referencia médica' : docType === 'studyrequest' ? 'solicitud de estudios' : 'incapacidad médica'
  const intro = docType === 'prescription'
    ? 'Seleccione el nivel de seguridad para compartir la receta médica con el paciente:'
    : `Se compartirá con el paciente un enlace al documento verificado (${docLabel}).`

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        border: '1px solid #e2e8f0',
        padding: '24px',
        position: 'relative',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#25D366" style={{ display: 'block', flexShrink: 0 }}>
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.324 5.328 0 11.896 0c3.181.001 6.173 1.24 8.424 3.493 2.25 2.253 3.487 5.244 3.484 8.427-.004 6.578-5.329 11.902-11.897 11.902-2.003-.001-3.973-.505-5.727-1.467L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.45 5.247 0 9.518-4.268 9.52-9.51 0-2.54-1-4.927-2.817-6.724-1.815-1.8-4.223-2.79-6.733-2.792-5.253 0-9.526 4.268-9.529 9.511 0 1.63.43 3.22 1.25 4.63l-.993 3.626 3.725-.976zm11.233-6.006c-.3-.15-1.772-.875-2.047-.975-.276-.1-.477-.15-.677.15-.2.3-.777.975-.952 1.175-.176.2-.351.225-.651.075-1.204-.6-2.002-1.054-2.8-2.427-.21-.362.21-.337.6-.113.35.2.775.9.875 1.1.1.2.05.375-.025.525-.075.15-.677.8-1.002 1.175-.325.375-.65.3-.95.15-1.157-.58-1.907-1.01-2.67-2.327-.15-.257-.15-.425.075-.65.2-.2.45-.525.677-.8.225-.275.3-.475.45-.775.15-.3.075-.575-.025-.775-.1-.2-.677-1.625-.927-2.225-.244-.588-.492-.51-.677-.52l-.576-.007c-.2 0-.527.075-.803.375-.276.3-1.053 1.025-1.053 2.5 0 1.475 1.078 2.9 1.228 3.1.15.2 2.122 3.24 5.141 4.542.717.31 1.277.494 1.714.633.72.228 1.376.196 1.894.118.577-.087 1.772-.725 2.022-1.425.25-.7.25-1.3 1.75-1.425-.075-.125-.275-.2-.575-.35z" />
            </svg>
            Enviar por WhatsApp
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>
          {intro}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {docType === 'prescription' ? (
            <>
              {/* Opción 1: Enlace Seguro */}
              <button
                onClick={() => {
                  const text = `Hola ${patient.first_name}, el ${docName} te ha compartido ${docNoun}:\n${appUrl}/prescriptions/view/${presc.id}\n\nCódigo de acceso: ${presc.verification_code}`
                  openWhatsApp(text)
                }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
                  padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', width: '100%'
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#cbd5e1' }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              >
                <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a', marginBottom: '2px' }}>🔒 Enlace Seguro (Pedir Código)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>El paciente deberá digitar el código de seguridad manualmente para poder ver la receta.</span>
                </div>
              </button>

              {/* Opción 2: Enlace Directo */}
              <button
                onClick={() => {
                  const text = `Hola ${patient.first_name}, el ${docName} te ha compartido ${docNoun}:\n${appUrl}/prescriptions/view/${presc.id}?code=${presc.verification_code}`
                  openWhatsApp(text)
                }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
                  padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', width: '100%'
                }}
                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#dcfce7'; e.currentTarget.style.borderColor = '#86efac' }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f0fdf4'; e.currentTarget.style.borderColor = '#bbf7d0' }}
              >
                <div style={{ backgroundColor: '#dcfce7', color: '#22c55e', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem', color: '#166534', marginBottom: '2px' }}>⚡ Enlace Directo (Un Clic)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#15803d', lineHeight: '1.4' }}>La receta se abre automáticamente al hacer clic en el enlace, sin solicitar código de seguridad.</span>
                </div>
              </button>
            </>
          ) : (
            /* Lab / Incapacidad: una sola opción → enlace público verificable */
            <button
              onClick={() => {
                const text = `Hola ${patient.first_name}, el ${docName} te ha compartido ${docNoun}:\n${docLink}`
                openWhatsApp(text)
              }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '12px',
                backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
                padding: '14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', width: '100%'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#dcfce7'; e.currentTarget.style.borderColor = '#86efac' }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f0fdf4'; e.currentTarget.style.borderColor = '#bbf7d0' }}
            >
              <div style={{ backgroundColor: '#dcfce7', color: '#22c55e', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontSize: '0.92rem', color: '#166534', marginBottom: '2px' }}>📲 Enviar enlace de {docLabel}</strong>
                <span style={{ fontSize: '0.8rem', color: '#15803d', lineHeight: '1.4' }}>El paciente abre el documento auténtico con su código de verificación, sin iniciar sesión.</span>
              </div>
            </button>
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

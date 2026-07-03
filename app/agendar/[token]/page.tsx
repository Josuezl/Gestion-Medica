import React from 'react'
import { createAdminClient } from '@/utils/supabase/admin'
import { doctorShortName } from '@/utils/doctorName'
import BookingWizard from './BookingWizard'

/**
 * Portal PÚBLICO de auto-agendamiento (sin login): el paciente llega por el link por
 * médico(+sede) generado en la agenda. La página solo resuelve el link con service_role y
 * pasa datos de DISPLAY (nombres, no IDs) al wizard; toda mutación va por las server actions.
 */
export default async function PublicBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let display: { doctorName: string; clinicName: string; locationName: string | null } | null = null

  if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    const admin = createAdminClient()
    const { data: link } = await admin
      .from('public_booking_links')
      .select('clinic_id, doctor_id, location_id')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle()

    if (link) {
      const [{ data: doctor }, { data: clinic }, location] = await Promise.all([
        admin.from('user_profiles').select('first_name, last_name, gender').eq('id', link.doctor_id).single(),
        admin.from('clinics').select('name').eq('id', link.clinic_id).single(),
        link.location_id
          ? admin.from('locations').select('name').eq('id', link.location_id).single().then(r => r.data)
          : Promise.resolve(null),
      ])
      display = {
        doctorName: doctorShortName(doctor?.first_name, doctor?.last_name, doctor?.gender),
        clinicName: clinic?.name || 'Clínica',
        locationName: location?.name || null,
      }
    }
  }

  if (!display) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: '440px', width: '100%', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.05)', padding: '40px 30px', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Enlace no disponible</h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
            Este enlace de agendamiento no existe o fue desactivado por la clínica.
            Comunícate directamente con tu médico para agendar tu cita.
          </p>
        </div>
      </div>
    )
  }

  return (
    <BookingWizard
      token={token}
      doctorName={display.doctorName}
      clinicName={display.clinicName}
      locationName={display.locationName}
    />
  )
}

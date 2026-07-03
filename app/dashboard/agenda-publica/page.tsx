import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Globe } from 'lucide-react'
import PublicLinksCard from './PublicLinksCard'
import DoctorScheduleCard from './DoctorScheduleCard'
import DoctorBlocksCard from './DoctorBlocksCard'
import { hondurasTodayYMD } from '@/utils/booking'

/**
 * Sección "Agenda en línea": todo lo del auto-agendamiento de pacientes en un solo lugar —
 * los enlaces públicos por médico(+sede) y el horario que el portal ofrece. La gestiona TODO
 * el personal de la clínica (asistentes, médicos y enfermería), igual que la agenda interna.
 */
export default async function AgendaPublicaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/login')

  const [{ data: doctors }, { data: locations }, { data: doctorSchedules }, { data: blocks }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, first_name, last_name, role, gender')
      .eq('clinic_id', profile.clinic_id)
      .in('role', ['ADMIN', 'DOCTOR'])
      .order('first_name', { ascending: true }),
    supabase
      .from('locations')
      .select('id, name, is_active')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('doctor_schedules')
      .select('id, doctor_id, location_id, weekday, start_time, end_time')
      .eq('clinic_id', profile.clinic_id)
      .order('weekday', { ascending: true }),
    // Bloqueos vigentes o futuros (los pasados ya no afectan al portal).
    supabase
      .from('doctor_schedule_blocks')
      .select('id, doctor_id, start_date, end_date, reason')
      .eq('clinic_id', profile.clinic_id)
      .gte('end_date', hondurasTodayYMD(new Date()))
      .order('start_date', { ascending: true }),
  ])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <Globe size={24} color="var(--primary)" />
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Agenda en línea</h2>
      </div>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Enlaces para que tus pacientes agenden su cita solos, y el horario que cada médico
        ofrece en línea. Las citas agendadas llegan a «Solicitudes» para su aprobación.
      </p>

      <PublicLinksCard doctors={doctors || []} locations={locations || []} />

      <DoctorScheduleCard
        doctors={doctors || []}
        schedules={doctorSchedules || []}
        locations={locations || []}
      />

      <DoctorBlocksCard doctors={doctors || []} blocks={blocks || []} />
    </div>
  )
}

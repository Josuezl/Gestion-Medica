import { createClient } from '@/utils/supabase/server'
import { getSessionProfile } from '@/utils/session'
import { greetingForHonduras, greetingName, isDoctorRole, hondurasDayRangeUTC } from '@/utils/greeting'

/** Datos que alimentan el banner de saludo del dashboard. */
export interface DashboardGreetingData {
  greeting: string
  name: string
  isDoctor: boolean
  /** Doctores: citas de hoy (propias). Personal: citas por aprobar. */
  todayCount: number
  stats: {
    /** Consultas completadas hoy por el propio médico. `null` para personal (asistente/enfermería). */
    completedPersonal: number | null
    /** Citas de hoy del propio médico aún sin completar. `null` para personal. */
    pendingPersonal: number | null
    /** Consultas completadas hoy en todo el centro (todos los médicos). */
    completedCenter: number
    newPatients: number
    totalPatients: number
  }
}

/**
 * Carga el saludo y las métricas del día para el usuario actual.
 * Todo se acota a la clínica del usuario (RLS + filtro explícito de defensa en profundidad).
 * "Hoy" es el día calendario de Honduras (UTC-6).
 */
export async function getDashboardGreetingData(): Promise<DashboardGreetingData | null> {
  const supabase = await createClient()

  // Sesión + perfil memoizados por request (compartidos con layout y página, P1-2).
  const session = await getSessionProfile()
  if (!session) return null
  const { user, profile } = session

  const clinicId = profile?.clinic_id || ''
  const doctor = isDoctorRole(profile?.role)
  const now = new Date()
  const { startISO, endISO } = hondurasDayRangeUTC(now)

  // "Citas de hoy" (doctor) o "citas por aprobar" (personal).
  const todayCountPromise = doctor
    ? supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('doctor_id', user.id)
        .gte('scheduled_at', startISO)
        .lt('scheduled_at', endISO)
        .not('status', 'in', '(CANCELLED,NO_SHOW)')
    : supabase
        .from('booking_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING')

  // Consultas completadas hoy en todo el centro (todos los médicos).
  const completedCenterPromise = supabase
    .from('consultations')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('created_at', startISO)
    .lt('created_at', endISO)

  // Consultas completadas hoy por el propio médico (solo aplica a médicos).
  const completedPersonalPromise = doctor
    ? supabase
        .from('consultations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('doctor_id', user.id)
        .gte('created_at', startISO)
        .lt('created_at', endISO)
    : Promise.resolve({ count: null as number | null })

  // Citas de hoy del propio médico aún sin completar (agendadas − ya realizadas).
  // Es "citas de hoy" menos las COMPLETED; canceladas/no-show tampoco cuentan.
  const pendingPersonalPromise = doctor
    ? supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('doctor_id', user.id)
        .gte('scheduled_at', startISO)
        .lt('scheduled_at', endISO)
        .not('status', 'in', '(CANCELLED,NO_SHOW,COMPLETED)')
    : Promise.resolve({ count: null as number | null })

  const newPatientsPromise = supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .gte('created_at', startISO)
    .lt('created_at', endISO)

  const totalPatientsPromise = supabase
    .from('patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)

  const [
    todayCountRes,
    completedCenterRes,
    completedPersonalRes,
    pendingPersonalRes,
    newPatientsRes,
    totalPatientsRes,
  ] = await Promise.all([
    todayCountPromise,
    completedCenterPromise,
    completedPersonalPromise,
    pendingPersonalPromise,
    newPatientsPromise,
    totalPatientsPromise,
  ])

  return {
    greeting: greetingForHonduras(now),
    name: greetingName(profile?.role, profile?.first_name, profile?.last_name, profile?.gender),
    isDoctor: doctor,
    todayCount: todayCountRes.count ?? 0,
    stats: {
      completedPersonal: doctor ? (completedPersonalRes.count ?? 0) : null,
      pendingPersonal: doctor ? (pendingPersonalRes.count ?? 0) : null,
      completedCenter: completedCenterRes.count ?? 0,
      newPatients: newPatientsRes.count ?? 0,
      totalPatients: totalPatientsRes.count ?? 0,
    },
  }
}

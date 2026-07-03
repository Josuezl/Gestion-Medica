import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient, { type ClinicReport } from './ReportsClient'

const PERIODS: Record<string, number> = { hoy: 1, '7': 7, '30': 30 }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ periodo?: string; fecha?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  // Fecha específica (tiene prioridad sobre el periodo relativo).
  const fecha = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) ? sp.fecha : null
  const periodo = fecha ? null : (sp.periodo && PERIODS[sp.periodo] ? sp.periodo : 'hoy')
  const days = periodo ? PERIODS[periodo] : 1

  // RPC agrega en BD (acotado a la clínica del usuario). Si no existe aún, degradar con aviso.
  // p_date solo se envía si hay fecha específica: así el reporte relativo sigue funcionando
  // aunque el RPC con firma (int, date) aún no se haya aplicado en la BD.
  const args: Record<string, number | string> = { p_days: days }
  if (fecha) args.p_date = fecha

  let report: ClinicReport | null = null
  let rpcMissing = false
  const { data, error } = await supabase.rpc('clinic_report', args)
  if (error || !data) rpcMissing = true
  else report = data

  return <ReportsClient report={report} periodo={periodo} selectedDate={fecha} rpcMissing={rpcMissing} />
}

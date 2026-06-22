import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'

const PERIODS: Record<string, number> = { hoy: 1, '7': 7, '30': 30 }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const periodo = sp.periodo && PERIODS[sp.periodo] ? sp.periodo : 'hoy'
  const days = PERIODS[periodo]

  // El RPC agrega en la BD (acotado a la clínica del usuario). Si aún no existe (deploy antes del DDL),
  // degradar con un aviso en vez de romper.
  let report: any = null
  let rpcMissing = false
  const { data, error } = await supabase.rpc('clinic_report', { p_days: days })
  if (error || !data) rpcMissing = true
  else report = data

  return <ReportsClient report={report} periodo={periodo} rpcMissing={rpcMissing} />
}

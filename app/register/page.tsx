import { redirect } from 'next/navigation'

// El registro público fue deshabilitado: las cuentas se provisionan exclusivamente
// desde /superadmin (dueños de clínica) o por el org-admin de cada clínica (equipo).
export default function RegisterPage() {
  redirect('/login')
}

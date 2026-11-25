// Helpers de permisos por rol. Funciones puras (sin 'use server'): se pueden usar
// tanto en Server Components / Server Actions como en componentes de cliente.
//
// Roles: 'ADMIN' | 'DOCTOR' | 'ASSISTANT' | 'NURSE'.
// - ADMIN/DOCTOR: trabajo clínico (crean consultas, ven el expediente).
// - ASSISTANT (secretaria/recepción): gestiona agenda y datos del paciente, entrega recetas;
//   no hace ni ve trabajo clínico.
// - NURSE (auxiliar de enfermería): toma signos vitales (pre-clínica) y ve la agenda; tampoco
//   hace ni ve trabajo clínico (igual de restringida que ASSISTANT en lo clínico).

export function isAssistant(role?: string | null): boolean {
  return (role || '').toUpperCase().trim() === 'ASSISTANT'
}

export function isNurse(role?: string | null): boolean {
  return (role || '').toUpperCase().trim() === 'NURSE'
}

// Puede crear consultas y ver el historial clínico (consultas, antecedentes,
// estudios, pediatría). Verdadero para ADMIN y DOCTOR; falso para ASSISTANT y NURSE.
export function canDoClinical(role?: string | null): boolean {
  return !isAssistant(role) && !isNurse(role)
}

// Puede registrar signos vitales (pre-clínica): personal clínico (ADMIN/DOCTOR) + NURSE.
// El asistente no toma signos.
export function canEnterVitals(role?: string | null): boolean {
  return canDoClinical(role) || isNurse(role)
}

/**
 * Puede registrar consultas dentales y odontogramas: con la licencia de odontología de la clínica,
 * el odontólogo o el administrador (rol ADMIN u org-admin). Un médico que no es administrador, no.
 * Misma regla que la función SQL is_dentist_now() de las políticas RLS.
 */
export function puedeRegistrarOdontologia(p: {
  odontologia_habilitada?: boolean | null
  is_dentist?: boolean | null
  is_org_admin?: boolean | null
  role?: string | null
}): boolean {
  if (p.odontologia_habilitada !== true) return false
  return p.is_dentist === true || p.is_org_admin === true || (p.role || '').toUpperCase().trim() === 'ADMIN'
}

// Nota: las recetas son inmutables una vez emitidas (por seguridad / integridad
// médico-legal). Ningún rol puede modificarlas, por lo que no existe un permiso
// de edición de recetas.

// Helpers de permisos por rol. Funciones puras (sin 'use server'): se pueden usar
// tanto en Server Components / Server Actions como en componentes de cliente.
//
// Roles: 'ADMIN' | 'DOCTOR' | 'ASSISTANT'. El asistente (secretaria/recepción)
// gestiona agenda y pacientes y entrega recetas, pero no hace ni ve trabajo clínico.

export function isAssistant(role?: string | null): boolean {
  return (role || '').toUpperCase().trim() === 'ASSISTANT'
}

// Puede crear consultas y ver el historial clínico (consultas, antecedentes,
// estudios, pediatría). Verdadero para ADMIN y DOCTOR.
export function canDoClinical(role?: string | null): boolean {
  return !isAssistant(role)
}

// Puede editar (modificar) recetas. El asistente solo puede verlas/enviarlas.
export function canEditPrescription(role?: string | null): boolean {
  return !isAssistant(role)
}

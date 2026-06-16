-- Género del miembro del equipo (médico/asistente), para mostrar el título correcto
-- "Dr."/"Dra." en recetas, agenda, impresiones, PDF, correo y verificación.
-- NULL = sin definir → se usa "Dr." por defecto.
alter table public.user_profiles
  add column if not exists gender char(1) check (gender in ('M', 'F', 'O'));

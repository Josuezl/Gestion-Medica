-- Permitir TODOS los estados de cita que conoce la UI (StatusDropdown / STATUS_CONFIG), para poder
-- agendar y cambiar a CUALQUIER estado. El CHECK anterior omitía NO_SHOW; la validación de la app
-- omitía WAITING/IN_PROGRESS (ya corregido en utils/validation.ts). Esto alinea los 3.
--
-- Robusto: quita cualquier CHECK existente sobre la columna status (sin depender del nombre) y
-- agrega el definitivo con los 7 estados.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.appointments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.appointments drop constraint %I', r.conname);
  end loop;

  alter table public.appointments
    add constraint appointments_status_check
    check (status in ('PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'));
end $$;

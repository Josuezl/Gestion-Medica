-- =====================================================================
-- HORARIOS DE AGENDA PÚBLICA POR SEDE (location)
--
-- Un médico puede atender en dos clínicas (locations) con horarios
-- distintos. doctor_schedules gana location_id opcional:
--   - location_id = NULL  → horario GENERAL del médico (toda la org).
--   - location_id = <uuid> → horario propio de esa sede.
-- El portal público usa el horario de la sede del link si existe;
-- si no, cae al horario general (utils/booking.ts → schedulesForLocation).
-- =====================================================================

alter table public.doctor_schedules
  add column if not exists location_id uuid references locations(id) on delete cascade;

create index if not exists idx_doctor_schedules_location
  on public.doctor_schedules(location_id);

-- El unique defensivo ahora debe distinguir la sede (mismo rango puede
-- existir en dos sedes distintas). NULL colapsado a uuid cero, igual que
-- en uniq_booking_link_active.
drop index if exists public.uniq_doctor_schedule;
create unique index if not exists uniq_doctor_schedule
  on public.doctor_schedules(
    doctor_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    weekday,
    start_time,
    end_time
  );

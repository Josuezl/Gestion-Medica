-- =====================================================================
-- DÍAS BLOQUEADOS DEL MÉDICO (vacaciones, congresos, permisos)
--
-- Rangos de fechas en que el portal público NO ofrece slots del médico
-- (en todas sus sedes: si está en un congreso, no está en ninguna).
-- La agenda interna no se ve afectada: el staff puede seguir agendando
-- a mano si hace falta. Lo gestiona todo el equipo en "Agenda en línea".
-- =====================================================================

create table if not exists public.doctor_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  doctor_id uuid not null references user_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz default now(),
  constraint doctor_blocks_range check (end_date >= start_date)
);
create index if not exists idx_doctor_blocks_doctor on public.doctor_schedule_blocks(doctor_id, end_date);
create index if not exists idx_doctor_blocks_clinic on public.doctor_schedule_blocks(clinic_id);

-- RLS: lo gestiona todo el equipo de la clínica; el portal anónimo lee vía service_role.
alter table public.doctor_schedule_blocks enable row level security;
drop policy if exists doctor_blocks_policy on public.doctor_schedule_blocks;
create policy doctor_blocks_policy on public.doctor_schedule_blocks for all to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- =====================================================================
-- PORTAL PÚBLICO DE AUTO-AGENDAMIENTO DE CITAS
--
-- El paciente agenda solo desde /agendar/[token] (link por médico+sede).
-- La solicitud crea una cita REAL en estado PENDING_REVIEW (bloquea el
-- slot) + una fila en booking_requests con los datos enviados; la ficha
-- del paciente NUEVO se crea hasta que el staff aprueba en Solicitudes.
-- El actor es anónimo: la app entra vía service_role; las tablas nuevas
-- tienen RLS sin políticas para anon (el rol anónimo no ve nada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuevo estado PENDING_REVIEW en appointments.status
--    (mismo patrón robusto de 20260621000000: drop dinámico + recrear)
-- ---------------------------------------------------------------------
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
    check (status in ('PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PENDING_REVIEW'));
end $$;

-- ---------------------------------------------------------------------
-- 2. Horarios semanales por médico (solo afectan al portal público).
--    weekday: 0=domingo .. 6=sábado (convención de Date.getDay()).
--    Varios rangos por día = varias filas. El anti-solape entre rangos
--    del mismo día se valida en la app (validateScheduleRanges).
-- ---------------------------------------------------------------------
create table if not exists public.doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  doctor_id uuid not null references user_profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz default now(),
  constraint doctor_schedules_range check (end_time > start_time)
);
create index if not exists idx_doctor_schedules_doctor on public.doctor_schedules(doctor_id, weekday);
create index if not exists idx_doctor_schedules_clinic on public.doctor_schedules(clinic_id);
create unique index if not exists uniq_doctor_schedule
  on public.doctor_schedules(doctor_id, weekday, start_time, end_time);

-- ---------------------------------------------------------------------
-- 3. Links públicos de agendamiento (por médico + sede opcional).
-- ---------------------------------------------------------------------
create table if not exists public.public_booking_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  doctor_id uuid not null references user_profiles(id) on delete cascade,
  location_id uuid references locations(id) on delete cascade,
  token varchar(64) not null unique,
  is_active boolean not null default true,
  created_by uuid references user_profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_booking_links_clinic on public.public_booking_links(clinic_id);
-- Un solo link ACTIVO por médico+sede (NULL de sede colapsado a uuid cero):
create unique index if not exists uniq_booking_link_active
  on public.public_booking_links (doctor_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

-- ---------------------------------------------------------------------
-- 4. Solicitudes del portal. Los datos del paciente NUEVO viajan aquí
--    (la ficha en patients se crea al aprobar). requested_at conserva el
--    slot pedido original aunque el staff edite la cita después.
-- ---------------------------------------------------------------------
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  booking_link_id uuid references public_booking_links(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  doctor_id uuid not null references user_profiles(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  matched_patient_id uuid references patients(id) on delete set null,
  submitted_first_name text not null,
  submitted_last_name text not null,
  submitted_birth_date date,
  submitted_id_card text,
  submitted_phone text,
  requested_at timestamptz not null,
  status varchar(20) not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  tracking_code varchar(20) not null unique,
  ip_address varchar(45),
  reviewed_by uuid references user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now()
);
create index if not exists idx_booking_requests_clinic_status on public.booking_requests(clinic_id, status);
create index if not exists idx_booking_requests_pending_ip
  on public.booking_requests(doctor_id, ip_address) where status = 'PENDING';
create index if not exists idx_booking_requests_pending_patient
  on public.booking_requests(matched_patient_id) where status = 'PENDING';
create index if not exists idx_booking_requests_appointment on public.booking_requests(appointment_id);

-- ---------------------------------------------------------------------
-- 5. Rate limiting pragmático para endpoints públicos (serverless: la
--    memoria del proceso no sirve; Postgres sí). Se auto-limpia por
--    bucket en cada chequeo (utils/rateLimit.ts).
-- ---------------------------------------------------------------------
create table if not exists public.booking_rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_events_bucket on public.booking_rate_events(bucket, created_at desc);

-- ---------------------------------------------------------------------
-- 6. RLS: el staff ve/gestiona lo de su clínica; el portal anónimo NO
--    tiene políticas (solo entra vía service_role, que ignora RLS).
-- ---------------------------------------------------------------------
alter table public.doctor_schedules enable row level security;
alter table public.public_booking_links enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_rate_events enable row level security; -- sin políticas: solo service_role

drop policy if exists doctor_schedules_select on public.doctor_schedules;
create policy doctor_schedules_select on public.doctor_schedules for select to authenticated
  using (clinic_id = public.current_clinic_id());
-- Escritura de horarios: solo org-admin (igual que el resto de configuración).
drop policy if exists doctor_schedules_write on public.doctor_schedules;
create policy doctor_schedules_write on public.doctor_schedules for all to authenticated
  using (clinic_id = public.current_clinic_id() and public.is_org_admin_now())
  with check (clinic_id = public.current_clinic_id() and public.is_org_admin_now());

-- Links: los maneja todo el equipo (como appointments).
drop policy if exists booking_links_policy on public.public_booking_links;
create policy booking_links_policy on public.public_booking_links for all to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- Solicitudes: el staff las lee y actualiza (aprobar/rechazar); el INSERT
-- solo lo hace el portal vía service_role, y no se borran (historial).
drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests for select to authenticated
  using (clinic_id = public.current_clinic_id());
drop policy if exists booking_requests_update on public.booking_requests;
create policy booking_requests_update on public.booking_requests for update to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

-- ---------------------------------------------------------------------
-- 7. RPC atómico de reserva pública. SECURITY INVOKER: se invoca
--    ÚNICAMENTE con service_role (bypassrls); revocado para todos los
--    demás roles. El advisory lock por médico serializa las reservas y
--    el solape se re-verifica DENTRO de la transacción => imposible que
--    dos pacientes tomen el mismo slot.
-- ---------------------------------------------------------------------
create or replace function public.create_public_booking(
  p_link_id uuid,
  p_matched_patient_id uuid,
  p_scheduled_at timestamptz,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_id_card text,
  p_phone text,
  p_tracking_code text,
  p_ip varchar
) returns table (appointment_id uuid, request_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_link record;
  v_appt_id uuid;
  v_req_id uuid;
begin
  select * into v_link from public_booking_links where id = p_link_id and is_active;
  if not found then
    raise exception 'LINK_INACTIVE';
  end if;

  -- Lock grueso por médico: el volumen de reservas es bajo; serializar
  -- toda reserva del mismo médico es suficiente y simple.
  perform pg_advisory_xact_lock(hashtextextended('public_booking:' || v_link.doctor_id::text, 0));

  -- Solape del slot de 60 min contra cualquier cita viva del médico
  -- (considera la duración real de las citas internas de 15/30/45 min).
  if exists (
    select 1 from appointments a
    where a.doctor_id = v_link.doctor_id
      and a.status not in ('CANCELLED', 'NO_SHOW')
      and a.scheduled_at < p_scheduled_at + interval '60 minutes'
      and a.scheduled_at + make_interval(mins => coalesce(a.duration_minutes, 15)) > p_scheduled_at
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  -- Anti-abuso re-verificado bajo el lock: 1 solicitud pendiente por
  -- IP+médico y 1 por paciente ya identificado.
  if p_ip is not null and exists (
    select 1 from booking_requests
    where doctor_id = v_link.doctor_id and ip_address = p_ip and status = 'PENDING'
  ) then
    raise exception 'IP_PENDING';
  end if;

  if p_matched_patient_id is not null and exists (
    select 1 from booking_requests
    where matched_patient_id = p_matched_patient_id and status = 'PENDING'
  ) then
    raise exception 'PATIENT_PENDING';
  end if;

  insert into appointments (clinic_id, patient_id, doctor_id, scheduled_at, status, duration_minutes, location_id, notes)
  values (
    v_link.clinic_id, p_matched_patient_id, v_link.doctor_id, p_scheduled_at, 'PENDING_REVIEW', 60,
    v_link.location_id,
    'Solicitud del portal público: ' || p_first_name || ' ' || p_last_name
  )
  returning id into v_appt_id;

  insert into booking_requests (
    clinic_id, booking_link_id, appointment_id, doctor_id, location_id,
    matched_patient_id, submitted_first_name, submitted_last_name, submitted_birth_date,
    submitted_id_card, submitted_phone, requested_at, tracking_code, ip_address
  )
  values (
    v_link.clinic_id, p_link_id, v_appt_id, v_link.doctor_id, v_link.location_id,
    p_matched_patient_id, p_first_name, p_last_name, p_birth_date,
    p_id_card, p_phone, p_scheduled_at, p_tracking_code, p_ip
  )
  returning id into v_req_id;

  return query select v_appt_id, v_req_id;
end $$;

-- Solo el service_role (el portal, server-side) puede ejecutar el RPC: al revocar de PUBLIC
-- se pierde el EXECUTE por defecto para TODOS (incluido service_role), así que se re-otorga.
revoke execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, date, text, text, text, varchar)
  from public, anon, authenticated;
grant execute on function public.create_public_booking(uuid, uuid, timestamptz, text, text, date, text, text, text, varchar)
  to service_role;

-- ---------------------------------------------------------------------
-- 8. Sincronía cita→solicitud: si el staff CANCELA o BORRA la cita
--    PENDING_REVIEW directamente en la agenda, la solicitud pendiente
--    pasa a REJECTED (el paciente verá "no aprobada" en /citas/[code]).
-- ---------------------------------------------------------------------
create or replace function public.sync_booking_request_on_appointment()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update booking_requests
      set status = 'REJECTED', reviewed_at = now(),
          rejection_reason = coalesce(rejection_reason, 'La cita fue eliminada por el personal.')
      where appointment_id = old.id and status = 'PENDING';
    return old;
  end if;

  if old.status = 'PENDING_REVIEW' and new.status = 'CANCELLED' then
    update booking_requests
      set status = 'REJECTED', reviewed_at = now(),
          rejection_reason = coalesce(rejection_reason, 'La cita fue cancelada por el personal.')
      where appointment_id = new.id and status = 'PENDING';
  end if;
  return new;
end $$;

drop trigger if exists on_appointment_booking_sync_update on public.appointments;
create trigger on_appointment_booking_sync_update
  after update of status on public.appointments
  for each row execute function public.sync_booking_request_on_appointment();

drop trigger if exists on_appointment_booking_sync_delete on public.appointments;
create trigger on_appointment_booking_sync_delete
  before delete on public.appointments
  for each row execute function public.sync_booking_request_on_appointment();

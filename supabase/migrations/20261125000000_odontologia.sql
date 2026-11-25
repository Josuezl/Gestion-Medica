alter table public.user_profiles
  add column is_dentist boolean not null default false;

create function public.is_dentist_now() returns boolean
  language sql stable security definer
  set search_path to public
as $$
  select coalesce((select is_dentist from user_profiles where id = auth.uid()), false);
$$;

create or replace function public.guard_user_profile_changes() returns trigger
  language plpgsql
as $$
begin
  if (new.role         is distinct from old.role
   or new.is_org_admin is distinct from old.is_org_admin
   or new.clinic_id    is distinct from old.clinic_id
   or new.is_dentist   is distinct from old.is_dentist)
     and not public.is_org_admin_now()
     and current_user <> 'service_role' then
    raise exception 'No autorizado para modificar rol, permisos o clínica.';
  end if;
  return new;
end;
$$;

-- Las consultas existentes y los guardados que omiten tipo siguen siendo médicos.
alter table public.consultations
  add column tipo text not null default 'MEDICA' check (tipo in ('MEDICA', 'DENTAL')),
  add column intraoral_exam text,
  add column procedures_done text;

create table public.odontogramas (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  consultation_id uuid not null unique references public.consultations(id) on delete cascade,
  doctor_id uuid not null references public.user_profiles(id),
  denticion text not null check (denticion in ('PERMANENTE', 'TEMPORAL', 'MIXTA')),
  estado jsonb not null,
  created_at timestamptz default now()
);

create index idx_odontogramas_patient_created_at
  on public.odontogramas (patient_id, created_at desc);

alter table public.odontogramas enable row level security;

create policy odontogramas_select on public.odontogramas for select to authenticated
  using (clinic_id = public.current_clinic_id());

create policy odontogramas_insert on public.odontogramas for insert to authenticated
  with check (clinic_id = public.current_clinic_id() and public.is_dentist_now());

create policy odontogramas_update on public.odontogramas for update to authenticated
  using (clinic_id = public.current_clinic_id() and public.is_dentist_now())
  with check (clinic_id = public.current_clinic_id() and public.is_dentist_now());

grant select, insert, update on public.odontogramas to authenticated;

create trigger trg_audit_odontogramas
  after insert or update or delete on public.odontogramas
  for each row execute function public.audit_row();

drop policy consultations_insert on public.consultations;
create policy consultations_insert on public.consultations for insert
  with check (
    clinic_id = (select clinic_id from public.user_profiles where id = auth.uid())
    and (tipo <> 'DENTAL' or public.is_dentist_now())
  );

drop policy consultations_update on public.consultations;
create policy consultations_update on public.consultations for update
  using (
    clinic_id = (select clinic_id from public.user_profiles where id = auth.uid())
    and (tipo <> 'DENTAL' or public.is_dentist_now())
  )
  with check (
    clinic_id = (select clinic_id from public.user_profiles where id = auth.uid())
    and (tipo <> 'DENTAL' or public.is_dentist_now())
  );

drop policy consultations_delete on public.consultations;
create policy consultations_delete on public.consultations for delete
  using (
    clinic_id = (select clinic_id from public.user_profiles where id = auth.uid())
    and (tipo <> 'DENTAL' or public.is_dentist_now() or public.is_org_admin_now())
  );

create function public.guardar_consulta_dental(
  p_patient_id uuid,
  p_appointment_id uuid,
  p_reason text,
  p_intraoral_exam text,
  p_diagnosis text,
  p_procedures_done text,
  p_treatment_plan text,
  p_denticion text,
  p_estado jsonb
) returns uuid
  language plpgsql security invoker
  set search_path to public
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_doctor_id uuid := auth.uid();
  v_consultation_id uuid;
begin
  if not exists (
    select 1 from public.patients where id = p_patient_id and clinic_id = v_clinic_id
  ) then
    raise insufficient_privilege using message = 'El paciente no pertenece a la clínica.';
  end if;

  insert into public.consultations (
    clinic_id, patient_id, doctor_id, appointment_id, tipo, reason_for_visit,
    intraoral_exam, diagnosis, procedures_done, treatment_plan
  ) values (
    v_clinic_id, p_patient_id, v_doctor_id, p_appointment_id, 'DENTAL', p_reason,
    p_intraoral_exam, p_diagnosis, p_procedures_done, p_treatment_plan
  ) returning id into v_consultation_id;

  insert into public.odontogramas (
    clinic_id, patient_id, consultation_id, doctor_id, denticion, estado
  ) values (
    v_clinic_id, p_patient_id, v_consultation_id, v_doctor_id, p_denticion, p_estado
  );

  if p_appointment_id is not null then
    update public.appointments
      set status = 'COMPLETED'
      where id = p_appointment_id and clinic_id = v_clinic_id;
    if not found then
      raise insufficient_privilege using message = 'La cita no pertenece a la clínica.';
    end if;
  end if;

  return v_consultation_id;
end;
$$;

revoke execute on function public.guardar_consulta_dental(uuid, uuid, text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.guardar_consulta_dental(uuid, uuid, text, text, text, text, text, text, jsonb)
  to authenticated;

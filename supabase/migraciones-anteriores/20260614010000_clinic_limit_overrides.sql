-- Overrides por-clínica de los topes del plan (médicos, asistentes, almacenamiento),
-- editables desde el superadmin. Generalizan max_locations_override (migración previa).
--
-- NULL en cualquier override = heredar el valor del plan (comportamiento actual).
-- Límite efectivo = coalesce(override_por_clínica, valor_del_plan).
alter table public.clinics add column if not exists max_doctors_override    integer;
alter table public.clinics add column if not exists max_assistants_override integer;
alter table public.clinics add column if not exists max_storage_mb_override integer;

comment on column public.clinics.max_doctors_override    is 'Override del tope de médicos. NULL = usar plans.max_doctors.';
comment on column public.clinics.max_assistants_override is 'Override del tope de asistentes. NULL = usar plans.max_assistants.';
comment on column public.clinics.max_storage_mb_override is 'Override de la cuota de almacenamiento (MB). NULL = usar plans.max_storage_mb.';

-- El trigger autoritativo del alta de usuarios debe honrar los overrides, o subir el
-- tope de médicos/asistentes desde el superadmin no surtiría efecto (seguiría bloqueando
-- contra el plan). Mantiene SET search_path = public, pg_temp (best practice Supabase).
create or replace function public.enforce_user_limits()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $fn$
declare
  v_max_doctors    int;
  v_max_assistants int;
  v_count          int;
begin
  select coalesce(c.max_doctors_override,    p.max_doctors),
         coalesce(c.max_assistants_override, p.max_assistants)
    into v_max_doctors, v_max_assistants
  from clinics c
  join plans p on p.code = c.plan_code
  where c.id = new.clinic_id;

  -- Clínica sin plan asociado: no bloquear (igual que antes).
  if v_max_doctors is null then
    return new;
  end if;

  if new.role = 'DOCTOR' then
    select count(*) into v_count from user_profiles where clinic_id = new.clinic_id and role = 'DOCTOR';
    if v_count >= v_max_doctors then
      raise exception 'Límite de médicos alcanzado (máx %).', v_max_doctors;
    end if;
  elsif new.role = 'ASSISTANT' then
    select count(*) into v_count from user_profiles where clinic_id = new.clinic_id and role = 'ASSISTANT';
    if v_count >= v_max_assistants then
      raise exception 'Límite de asistentes alcanzado (máx %).', v_max_assistants;
    end if;
  end if;

  return new;
end;
$fn$;

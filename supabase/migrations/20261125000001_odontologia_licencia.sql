alter table public.clinics
  add column odontologia_habilitada boolean not null default false;

create or replace function public.guard_clinic_changes() returns trigger
  language plpgsql
as $$
begin
  if (new.plan_code is distinct from old.plan_code
   or new.owner_user_id is distinct from old.owner_user_id)
     and current_user <> 'service_role' then
    raise exception 'plan_code y owner_user_id solo se cambian del lado del servidor.';
  end if;
  if new.odontologia_habilitada is distinct from old.odontologia_habilitada
     and current_user <> 'service_role' then
    raise exception 'La licencia de odontología solo se cambia del lado del servidor.';
  end if;
  return new;
end;
$$;

create function public.odontologia_habilitada_now() returns boolean
  language sql stable security definer
  set search_path to public
as $$
  select coalesce((
    select c.odontologia_habilitada
    from public.user_profiles p
    join public.clinics c on c.id = p.clinic_id
    where p.id = auth.uid()
  ), false);
$$;

-- Puede registrar odontología (consultas dentales y odontogramas): el odontólogo o el administrador
-- de la clínica (rol ADMIN u org-admin), siempre que la clínica tenga la licencia. Un médico que no es
-- administrador no puede. El nombre se conserva porque las políticas de la migración anterior lo usan.
create or replace function public.is_dentist_now() returns boolean
  language sql stable security definer
  set search_path to public
as $$
  select coalesce((
    select p.is_dentist or coalesce(p.is_org_admin, false) or upper(trim(coalesce(p.role, ''))) = 'ADMIN'
    from public.user_profiles p
    where p.id = auth.uid()
  ), false)
    and public.odontologia_habilitada_now();
$$;

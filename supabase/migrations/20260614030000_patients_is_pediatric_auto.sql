-- is_pediatric pasa a ser SIEMPRE derivado de la edad (< 19 años) a partir de birth_date.
-- Un trigger lo garantiza en cualquier inserción/actualización, incluidas las inserciones
-- directas vía REST/service-role de los scripts de migración —que se saltan createPatient y
-- fue justo lo que dejó sin tag a los pacientes migrados.
create or replace function public.set_is_pediatric()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $fn$
begin
  new.is_pediatric := (new.birth_date is not null
                       and new.birth_date > (current_date - interval '19 years'));
  return new;
end;
$fn$;

drop trigger if exists trg_set_is_pediatric on public.patients;
create trigger trg_set_is_pediatric
  before insert or update of birth_date on public.patients
  for each row execute function public.set_is_pediatric();

-- Backfill del 100% de los pacientes existentes (todos los tenants). El placeholder de
-- nacimiento desconocido (1900-01-01) queda como NO pediátrico, que es lo correcto.
update public.patients
set is_pediatric = (birth_date is not null and birth_date > (current_date - interval '19 years'));

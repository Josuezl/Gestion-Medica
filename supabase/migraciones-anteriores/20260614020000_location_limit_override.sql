-- Fix: el trigger enforce_location_limits (en la tabla locations) validaba el tope leyendo
-- solo plans.max_locations, ignorando el override por-clínica. Por eso, aunque la app y el
-- superadmin mostraban el límite efectivo (p. ej. 5), el INSERT lo rechazaba la BD con
-- "Límite de sucursales del plan alcanzado (máx 1)".
--
-- Solución: usar coalesce(c.max_locations_override, p.max_locations), igual que el resto de
-- los límites. (El trigger trg_enforce_location_limits sigue apuntando a esta misma función.)
create or replace function public.enforce_location_limits()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $function$
declare v_max int; v_count int;
begin
  select coalesce(c.max_locations_override, p.max_locations)
    into v_max
  from clinics c
  join plans p on p.code = c.plan_code
  where c.id = new.clinic_id;

  select count(*) into v_count from locations where clinic_id = new.clinic_id;

  if v_count >= coalesce(v_max, 0) then
    raise exception 'Límite de clínicas alcanzado (máx %).', v_max;
  end if;

  return new;
end;
$function$;

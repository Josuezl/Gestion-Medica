-- Override por-clínica del tope de clínicas (locations), independiente del plan.
-- Permite habilitar la gestión de clínicas para un tenant aunque su plan no la
-- contemple (p. ej. un HOSPITAL puntual), sin cambiar su plan_code ni afectar a
-- los demás tenants.
--
-- NULL (default)  → comportamiento por plan: la UI de "Clínicas" se muestra solo
--                   para SOLO_MEDICO y el tope = plans.max_locations.
-- Non-null        → habilita la gestión de clínicas para ese tenant y fija el
--                   tope a este valor (cuenta el total de locations, incl. la principal).
alter table public.clinics
  add column if not exists max_locations_override integer;

comment on column public.clinics.max_locations_override is
  'Override por-clínica del tope de clínicas (locations). NULL = usar plans.max_locations y la regla por plan. Non-null = habilita la gestión de clínicas para este tenant con este límite.';

-- Centro Neurológico y Cardiovascular (licencia HOSPITAL): habilitar creación de
-- clínicas con tope de 5 en total. Solo afecta a este tenant; reversible con NULL.
-- Se filtra también por plan_code para no tocar por accidente otro tenant homónimo.
update public.clinics
set max_locations_override = 5
where name ilike '%Centro Neuro%'
  and plan_code = 'HOSPITAL';

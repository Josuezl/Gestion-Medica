-- "Creado por": guardar qué usuario registró a cada paciente. Nullable (los pacientes migrados
-- por service-role quedan sin autor → se muestran como "—"). Se llena en createPatient de aquí en adelante.
alter table public.patients
  add column if not exists created_by uuid references public.user_profiles(id) on delete set null;

-- Detalle del reporte: agrega 'creado_por' al listado de pacientes nuevos (consultas/citas sin cambios).
create or replace function public.clinic_report_detail(p_tipo text, p_days int default 1, p_date date default null)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $fn$
declare
  v_clinic uuid := (select clinic_id from public.user_profiles where id = auth.uid());
  v_tz text := 'America/Tegucigalpa';
  v_today date := coalesce(p_date, (now() at time zone v_tz)::date);
  v_from date := case when p_date is not null then p_date
                      else v_today - (greatest(coalesce(p_days, 1), 1) - 1) end;
begin
  if v_clinic is null then return '[]'::jsonb; end if;

  if p_tipo = 'consultas' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('fecha', fecha, 'paciente', paciente, 'medico', medico, 'especialidad', especialidad) order by fecha desc)
      from (
        select (c.created_at at time zone v_tz) as fecha,
               trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as paciente,
               trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')) as medico,
               up.specialty as especialidad
        from consultations c
        join patients p on p.id = c.patient_id
        left join user_profiles up on up.id = c.doctor_id
        where c.clinic_id = v_clinic and (c.created_at at time zone v_tz)::date between v_from and v_today
        order by c.created_at desc limit 500
      ) t
    ), '[]'::jsonb);

  elsif p_tipo = 'citas' or p_tipo = 'no_show' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('fecha', fecha, 'paciente', paciente, 'medico', medico, 'especialidad', especialidad, 'estado', estado) order by fecha desc)
      from (
        select (a.scheduled_at at time zone v_tz) as fecha,
               trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as paciente,
               trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')) as medico,
               up.specialty as especialidad,
               a.status as estado
        from appointments a
        left join patients p on p.id = a.patient_id
        left join user_profiles up on up.id = a.doctor_id
        where a.clinic_id = v_clinic and (a.scheduled_at at time zone v_tz)::date between v_from and v_today
          and (p_tipo = 'citas' or a.status = 'NO_SHOW')
        order by a.scheduled_at desc limit 500
      ) t
    ), '[]'::jsonb);

  elsif p_tipo = 'pacientes_nuevos' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('fecha', fecha, 'paciente', paciente, 'expediente', expediente, 'creado_por', creado_por) order by fecha desc)
      from (
        select (p.created_at at time zone v_tz) as fecha,
               trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as paciente,
               p.record_number as expediente,
               nullif(trim(coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')), '') as creado_por
        from patients p
        left join user_profiles cu on cu.id = p.created_by
        where p.clinic_id = v_clinic and (p.created_at at time zone v_tz)::date between v_from and v_today
        order by p.created_at desc limit 500
      ) t
    ), '[]'::jsonb);
  end if;

  return '[]'::jsonb;
end;
$fn$;

grant execute on function public.clinic_report_detail(text, int, date) to authenticated;

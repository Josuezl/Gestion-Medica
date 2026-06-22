-- Reportes: además de la ventana relativa (p_days), permitir consultar un DÍA específico (p_date).
-- Si p_date != null → el reporte es solo de ese día; si es null → ventana de p_days terminando hoy.
-- Reemplaza la firma clinic_report(int) por clinic_report(int, date).
drop function if exists public.clinic_report(int);

create or replace function public.clinic_report(p_days int default 1, p_date date default null)
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
  if v_clinic is null then
    return jsonb_build_object('error', 'no_clinic');
  end if;

  return jsonb_build_object(
    'por_medico', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', nombre, 'genero', genero, 'total', total) order by total desc)
      from (
        select trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')) as nombre,
               up.gender as genero, count(*) as total
        from consultations c
        join user_profiles up on up.id = c.doctor_id
        where c.clinic_id = v_clinic
          and (c.created_at at time zone v_tz)::date between v_from and v_today
        group by up.id, up.first_name, up.last_name, up.gender
      ) t
    ), '[]'::jsonb),

    'serie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', d::date::text,
               'consultas', (select count(*) from consultations c where c.clinic_id = v_clinic and (c.created_at at time zone v_tz)::date = d),
               'pacientes_nuevos', (select count(*) from patients p where p.clinic_id = v_clinic and (p.created_at at time zone v_tz)::date = d),
               'citas', (select count(*) from appointments a where a.clinic_id = v_clinic and (a.scheduled_at at time zone v_tz)::date = d)
             ) order by d)
      from generate_series(v_from, v_today, interval '1 day') g(d)
    ), '[]'::jsonb),

    'citas_estado', coalesce((
      select jsonb_agg(jsonb_build_object('status', status, 'total', total))
      from (
        select status, count(*) as total
        from appointments a
        where a.clinic_id = v_clinic
          and (a.scheduled_at at time zone v_tz)::date between v_from and v_today
        group by status
      ) s
    ), '[]'::jsonb),

    'demografia', jsonb_build_object(
      'genero', jsonb_build_object(
        'M', (select count(*) from patients where clinic_id = v_clinic and gender = 'M'),
        'F', (select count(*) from patients where clinic_id = v_clinic and gender = 'F'),
        'ND', (select count(*) from patients where clinic_id = v_clinic and (gender is null or gender not in ('M', 'F')))
      ),
      'edad', jsonb_build_object(
        'pediatricos', (select count(*) from patients where clinic_id = v_clinic and is_pediatric = true),
        'adultos', (select count(*) from patients where clinic_id = v_clinic and is_pediatric = false)
      )
    ),

    'kpis', jsonb_build_object(
      'consultas', (select count(*) from consultations where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_from and v_today),
      'citas', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_from and v_today),
      'no_show', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_from and v_today and status = 'NO_SHOW'),
      'pacientes_nuevos', (select count(*) from patients where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_from and v_today),
      'pacientes_total', (select count(*) from patients where clinic_id = v_clinic)
    )
  );
end;
$fn$;

grant execute on function public.clinic_report(int, date) to authenticated;

-- Reportes v2: amplía el RPC clinic_report (misma firma (int, date)) con tres
-- bloques nuevos que la UI rediseñada consume de forma OPCIONAL — si la función
-- vieja sigue en la BD, la página funciona igual y solo oculta esas secciones:
--   * serie_diaria : consultas y citas por día del periodo (tendencia)
--   * citas_hora   : distribución de citas por hora del día (horas pico)
--   * kpis_prev    : mismos KPIs del periodo anterior equivalente (deltas %)
--   * rango        : fechas desde/hasta que cubrió el reporte
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
  -- Periodo anterior equivalente (misma longitud, inmediatamente antes).
  v_len int := v_today - v_from + 1;
  v_prev_from date := v_from - v_len;
  v_prev_to date := v_from - 1;
begin
  if v_clinic is null then
    return jsonb_build_object('error', 'no_clinic');
  end if;

  return jsonb_build_object(
    'rango', jsonb_build_object(
      'desde', to_char(v_from, 'YYYY-MM-DD'),
      'hasta', to_char(v_today, 'YYYY-MM-DD')
    ),

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

    -- Pacientes DISTINTOS atendidos por especialidad del médico
    'por_especialidad', coalesce((
      select jsonb_agg(jsonb_build_object('especialidad', esp, 'total', total) order by total desc)
      from (
        select coalesce(nullif(trim(up.specialty), ''), 'Sin especialidad') as esp,
               count(distinct c.patient_id) as total
        from consultations c
        join user_profiles up on up.id = c.doctor_id
        where c.clinic_id = v_clinic
          and (c.created_at at time zone v_tz)::date between v_from and v_today
        group by coalesce(nullif(trim(up.specialty), ''), 'Sin especialidad')
      ) t
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

    -- Consultas y citas por día (para la gráfica de tendencia y los sparklines).
    -- Incluye los días en cero para que la serie no tenga huecos.
    'serie_diaria', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', to_char(d.dia, 'YYYY-MM-DD'),
               'consultas', coalesce(c.total, 0),
               'citas', coalesce(a.total, 0)
             ) order by d.dia)
      from (select generate_series(v_from, v_today, interval '1 day')::date as dia) d
      left join (
        select (created_at at time zone v_tz)::date as dia, count(*) as total
        from consultations
        where clinic_id = v_clinic
          and (created_at at time zone v_tz)::date between v_from and v_today
        group by 1
      ) c on c.dia = d.dia
      left join (
        select (scheduled_at at time zone v_tz)::date as dia, count(*) as total
        from appointments
        where clinic_id = v_clinic
          and (scheduled_at at time zone v_tz)::date between v_from and v_today
        group by 1
      ) a on a.dia = d.dia
    ), '[]'::jsonb),

    -- Citas agrupadas por hora local (horas pico para planificar personal).
    'citas_hora', coalesce((
      select jsonb_agg(jsonb_build_object('hora', hora, 'total', total) order by hora)
      from (
        select extract(hour from (scheduled_at at time zone v_tz))::int as hora, count(*) as total
        from appointments
        where clinic_id = v_clinic
          and (scheduled_at at time zone v_tz)::date between v_from and v_today
        group by 1
      ) h
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
    ),

    -- KPIs del periodo anterior equivalente, para mostrar la variación (%).
    'kpis_prev', jsonb_build_object(
      'consultas', (select count(*) from consultations where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_prev_from and v_prev_to),
      'citas', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_prev_from and v_prev_to),
      'no_show', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_prev_from and v_prev_to and status = 'NO_SHOW'),
      'pacientes_nuevos', (select count(*) from patients where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_prev_from and v_prev_to)
    )
  );
end;
$fn$;

grant execute on function public.clinic_report(int, date) to authenticated;

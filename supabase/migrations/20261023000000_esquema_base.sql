


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_platform_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT jsonb_build_object(
    'total_orgs',          (SELECT count(*) FROM clinics),
    'por_plan',            (SELECT jsonb_object_agg(plan_code, n)
                            FROM (SELECT plan_code, count(*) n FROM clinics GROUP BY plan_code) s),
    'total_medicos',       (SELECT count(*) FROM user_profiles WHERE role = 'DOCTOR'),
    'total_asistentes',    (SELECT count(*) FROM user_profiles WHERE role = 'ASSISTANT'),
    'total_pacientes',     (SELECT count(*) FROM patients),
    'almacenamiento_bytes',(SELECT coalesce(sum((metadata->>'size')::bigint), 0)
                            FROM storage.objects WHERE bucket_id = ANY (ARRAY['prescriptions','medical-studies','signatures']))
  ) INTO result;
  RETURN result;
END; $$;


ALTER FUNCTION "public"."admin_platform_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_tenant_overview"() RETURNS TABLE("clinic_id" "uuid", "clinic_name" "text", "plan_code" "text", "doctors" integer, "assistants" integer, "patients" integer, "storage_bytes" bigint, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
BEGIN
  IF NOT is_platform_admin() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
  SELECT c.id, c.name::text, c.plan_code::text,
    (SELECT count(*)::int FROM user_profiles u WHERE u.clinic_id = c.id AND u.role = 'DOCTOR'),
    (SELECT count(*)::int FROM user_profiles u WHERE u.clinic_id = c.id AND u.role = 'ASSISTANT'),
    (SELECT count(*)::int FROM patients p WHERE p.clinic_id = c.id),
    coalesce((SELECT sum((o.metadata->>'size')::bigint) FROM storage.objects o
              WHERE o.bucket_id = ANY (ARRAY['recetas','estudios','firmas'])
                AND (storage.foldername(o.name))[1] = c.id::text), 0)::bigint,
    c.created_at
  FROM clinics c ORDER BY c.created_at DESC;
END; $$;


ALTER FUNCTION "public"."admin_tenant_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO audit_logs (clinic_id, performed_by, action, table_name, record_id)
  VALUES (coalesce(NEW.clinic_id, OLD.clinic_id), auth.uid(), TG_OP, TG_TABLE_NAME, coalesce(NEW.id, OLD.id));
  RETURN coalesce(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."audit_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinic_report"("p_days" integer DEFAULT 1, "p_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_clinic uuid := (select clinic_id from public.user_profiles where id = auth.uid());
  v_tz text := 'America/Tegucigalpa';
  v_today date := coalesce(p_date, (now() at time zone v_tz)::date);
  v_from date := case when p_date is not null then p_date
                      else v_today - (greatest(coalesce(p_days, 1), 1) - 1) end;
  -- Ventana de la serie diaria: el periodo pedido, con un mínimo de 7 días.
  v_serie_from date := least(v_from, v_today - 6);
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

    -- Serie por día (tendencia + sparklines). Incluye los días en cero.
    'serie_diaria', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', to_char(d.dia, 'YYYY-MM-DD'),
               'consultas', coalesce(c.total, 0),
               'citas', coalesce(a.total, 0),
               'nuevos', coalesce(n.total, 0),
               'no_show', coalesce(ns.total, 0)
             ) order by d.dia)
      from (select generate_series(v_serie_from, v_today, interval '1 day')::date as dia) d
      left join (
        select (created_at at time zone v_tz)::date as dia, count(*) as total
        from consultations
        where clinic_id = v_clinic
          and (created_at at time zone v_tz)::date between v_serie_from and v_today
        group by 1
      ) c on c.dia = d.dia
      left join (
        select (scheduled_at at time zone v_tz)::date as dia, count(*) as total
        from appointments
        where clinic_id = v_clinic
          and (scheduled_at at time zone v_tz)::date between v_serie_from and v_today
        group by 1
      ) a on a.dia = d.dia
      left join (
        select (created_at at time zone v_tz)::date as dia, count(*) as total
        from patients
        where clinic_id = v_clinic
          and (created_at at time zone v_tz)::date between v_serie_from and v_today
        group by 1
      ) n on n.dia = d.dia
      left join (
        select (scheduled_at at time zone v_tz)::date as dia, count(*) as total
        from appointments
        where clinic_id = v_clinic and status = 'NO_SHOW'
          and (scheduled_at at time zone v_tz)::date between v_serie_from and v_today
        group by 1
      ) ns on ns.dia = d.dia
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

    -- KPIs del periodo anterior equivalente (disponible para la UI; hoy no se muestra).
    'kpis_prev', jsonb_build_object(
      'consultas', (select count(*) from consultations where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_prev_from and v_prev_to),
      'citas', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_prev_from and v_prev_to),
      'no_show', (select count(*) from appointments where clinic_id = v_clinic and (scheduled_at at time zone v_tz)::date between v_prev_from and v_prev_to and status = 'NO_SHOW'),
      'pacientes_nuevos', (select count(*) from patients where clinic_id = v_clinic and (created_at at time zone v_tz)::date between v_prev_from and v_prev_to)
    )
  );
end;
$$;


ALTER FUNCTION "public"."clinic_report"("p_days" integer, "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinic_report_detail"("p_tipo" "text", "p_days" integer DEFAULT 1, "p_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_clinic uuid := (select clinic_id from public.user_profiles where id = auth.uid());
  v_tz text := 'America/Tegucigalpa';
  v_today date := coalesce(p_date, (now() at time zone v_tz)::date);
  v_from date := case when p_date is not null then p_date else v_today - (greatest(coalesce(p_days,1),1)-1) end;
begin
  if v_clinic is null then return '[]'::jsonb; end if;
  if p_tipo = 'consultas' then
    return coalesce((select jsonb_agg(jsonb_build_object('fecha',fecha,'paciente',paciente,'medico',medico,'especialidad',especialidad) order by fecha desc)
      from (select (c.created_at at time zone v_tz) as fecha,
                   trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) as paciente,
                   trim(coalesce(up.first_name,'')||' '||coalesce(up.last_name,'')) as medico, up.specialty as especialidad
            from consultations c join patients p on p.id=c.patient_id
            left join user_profiles up on up.id=c.doctor_id
            where c.clinic_id=v_clinic and (c.created_at at time zone v_tz)::date between v_from and v_today
            order by c.created_at desc limit 500) t), '[]'::jsonb);
  elsif p_tipo = 'citas' or p_tipo = 'no_show' then
    return coalesce((select jsonb_agg(jsonb_build_object('fecha',fecha,'paciente',paciente,'medico',medico,'especialidad',especialidad,'estado',estado) order by fecha desc)
      from (select (a.scheduled_at at time zone v_tz) as fecha,
                   trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) as paciente,
                   trim(coalesce(up.first_name,'')||' '||coalesce(up.last_name,'')) as medico, up.specialty as especialidad, a.status as estado
            from appointments a left join patients p on p.id=a.patient_id
            left join user_profiles up on up.id=a.doctor_id
            where a.clinic_id=v_clinic and (a.scheduled_at at time zone v_tz)::date between v_from and v_today
              and (p_tipo='citas' or a.status='NO_SHOW')
            order by a.scheduled_at desc limit 500) t), '[]'::jsonb);
  elsif p_tipo = 'pacientes_nuevos' then
    return coalesce((select jsonb_agg(jsonb_build_object('fecha',fecha,'paciente',paciente,'expediente',expediente,'creado_por',creado_por) order by fecha desc)
      from (select (p.created_at at time zone v_tz) as fecha,
                   trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) as paciente, p.record_number as expediente,
                   nullif(trim(coalesce(cu.first_name,'')||' '||coalesce(cu.last_name,'')),'') as creado_por
            from patients p left join user_profiles cu on cu.id = p.created_by
            where p.clinic_id=v_clinic and (p.created_at at time zone v_tz)::date between v_from and v_today
            order by p.created_at desc limit 500) t), '[]'::jsonb);
  end if;
  return '[]'::jsonb;
end;
$$;


ALTER FUNCTION "public"."clinic_report_detail"("p_tipo" "text", "p_days" integer, "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clinic_storage_bytes"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('medical-studies','prescriptions')
    and (storage.foldername(o.name))[1] = current_clinic_id()::text;
$$;


ALTER FUNCTION "public"."clinic_storage_bytes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_public_booking"("p_link_id" "uuid", "p_matched_patient_id" "uuid", "p_scheduled_at" timestamp with time zone, "p_first_name" "text", "p_last_name" "text", "p_birth_date" "date", "p_id_card" "text", "p_phone" "text", "p_tracking_code" "text", "p_ip" character varying) RETURNS TABLE("appointment_id" "uuid", "request_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_public_booking"("p_link_id" "uuid", "p_matched_patient_id" "uuid", "p_scheduled_at" timestamp with time zone, "p_first_name" "text", "p_last_name" "text", "p_birth_date" "date", "p_id_card" "text", "p_phone" "text", "p_tracking_code" "text", "p_ip" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_clinic_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT clinic_id FROM user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_clinic_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_location_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."enforce_location_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_user_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."enforce_user_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_clinic"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT clinic_id FROM public.user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_clinic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_clinic_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (NEW.plan_code IS DISTINCT FROM OLD.plan_code
   OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id)
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'plan_code y owner_user_id solo se cambian del lado del servidor.';
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."guard_clinic_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_user_profile_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (NEW.role         IS DISTINCT FROM OLD.role
   OR NEW.is_org_admin IS DISTINCT FROM OLD.is_org_admin
   OR NEW.clinic_id    IS DISTINCT FROM OLD.clinic_id)
     AND NOT is_org_admin_now()
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado para modificar rol, permisos o clínica.';
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."guard_user_profile_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'first_name', 'Nuevo'),
    COALESCE(new.raw_user_meta_data->>'last_name', 'Usuario'),
    COALESCE(new.raw_user_meta_data->>'role', 'DOCTOR')
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin_now"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce((SELECT is_org_admin FROM user_profiles WHERE id = auth.uid()), false);
$$;


ALTER FUNCTION "public"."is_org_admin_now"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_appointment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_clinic_id UUID;
    v_performed_by UUID;
    v_action VARCHAR(50);
    v_record_id UUID;
    v_metadata JSONB;
BEGIN
    -- Autor; NULL si es acción de sistema/bot (service_role, sin sesión).
    BEGIN
        v_performed_by := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_performed_by := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_clinic_id := old.clinic_id;
        v_record_id := old.id;
        v_action := 'DELETE_APPOINTMENT';
        v_metadata := jsonb_build_object(
            'status', old.status,
            'scheduled_at', old.scheduled_at,
            'doctor_id', old.doctor_id,
            'patient_id', old.patient_id
        );
    ELSIF TG_OP = 'INSERT' THEN
        v_clinic_id := new.clinic_id;
        v_record_id := new.id;
        v_action := 'CREATE_APPOINTMENT';
        v_metadata := jsonb_build_object(
            'status', new.status,
            'scheduled_at', new.scheduled_at,
            'doctor_id', new.doctor_id,
            'patient_id', new.patient_id
        );
    ELSE
        -- UPDATE: registrar solo los campos que cambiaron (old/new).
        v_clinic_id := new.clinic_id;
        v_record_id := new.id;
        v_metadata := '{}'::jsonb;

        IF new.status IS DISTINCT FROM old.status THEN
            v_metadata := v_metadata || jsonb_build_object('status', jsonb_build_object('old', old.status, 'new', new.status));
        END IF;
        IF new.scheduled_at IS DISTINCT FROM old.scheduled_at THEN
            v_metadata := v_metadata || jsonb_build_object('scheduled_at', jsonb_build_object('old', old.scheduled_at, 'new', new.scheduled_at));
        END IF;
        IF new.doctor_id IS DISTINCT FROM old.doctor_id THEN
            v_metadata := v_metadata || jsonb_build_object('doctor_id', jsonb_build_object('old', old.doctor_id, 'new', new.doctor_id));
        END IF;
        IF new.patient_id IS DISTINCT FROM old.patient_id THEN
            v_metadata := v_metadata || jsonb_build_object('patient_id', jsonb_build_object('old', old.patient_id, 'new', new.patient_id));
        END IF;
        IF new.location_id IS DISTINCT FROM old.location_id THEN
            v_metadata := v_metadata || jsonb_build_object('location_id', jsonb_build_object('old', old.location_id, 'new', new.location_id));
        END IF;
        IF new.duration_minutes IS DISTINCT FROM old.duration_minutes THEN
            v_metadata := v_metadata || jsonb_build_object('duration_minutes', jsonb_build_object('old', old.duration_minutes, 'new', new.duration_minutes));
        END IF;
        IF new.notes IS DISTINCT FROM old.notes THEN
            v_metadata := v_metadata || jsonb_build_object('notes', jsonb_build_object('old', old.notes, 'new', new.notes));
        END IF;

        -- Sin cambios rastreados → no registrar (evita ruido).
        IF v_metadata = '{}'::jsonb THEN
            RETURN new;
        END IF;

        -- Solo cambió el estado → acción específica; si cambió algo más, edición general.
        IF (v_metadata ? 'status') AND (v_metadata - 'status') = '{}'::jsonb THEN
            v_action := 'UPDATE_APPOINTMENT_STATUS';
        ELSE
            v_action := 'EDIT_APPOINTMENT';
        END IF;
    END IF;

    INSERT INTO public.audit_logs (clinic_id, performed_by, action, record_id, table_name, metadata)
    VALUES (v_clinic_id, v_performed_by, v_action, v_record_id, 'appointments', v_metadata);

    RETURN COALESCE(new, old);
END;
$$;


ALTER FUNCTION "public"."log_appointment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_audit_event"("p_action" character varying, "p_record_id" "uuid", "p_table_name" character varying) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_clinic uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then return; end if;
  insert into public.audit_logs (clinic_id, performed_by, action, record_id, table_name)
  values (v_clinic, auth.uid(), p_action, p_record_id, p_table_name);
end;
$$;


ALTER FUNCTION "public"."log_audit_event"("p_action" character varying, "p_record_id" "uuid", "p_table_name" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_consultation_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_clinic_id UUID;
    v_performed_by UUID;
    v_action VARCHAR(50);
    v_record_id UUID;
    v_metadata JSONB;
BEGIN
    BEGIN
        v_performed_by := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_performed_by := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_clinic_id := old.clinic_id;
        v_record_id := old.id;
        v_action := 'DELETE_CONSULTATION';
        v_metadata := jsonb_build_object('patient_id', old.patient_id, 'appointment_id', old.appointment_id, 'doctor_id', old.doctor_id);
    ELSE
        v_clinic_id := new.clinic_id;
        v_record_id := new.id;
        IF TG_OP = 'INSERT' THEN
            v_action := 'CREATE_CONSULTATION';
        ELSE
            v_action := 'EDIT_CONSULTATION';
        END IF;
        v_metadata := jsonb_build_object('patient_id', new.patient_id, 'appointment_id', new.appointment_id, 'doctor_id', new.doctor_id);

        -- En UPDATE, si cambió la incapacidad, registrar el detalle old->new.
        IF TG_OP = 'UPDATE' AND new.medical_leave IS DISTINCT FROM old.medical_leave THEN
            v_metadata := v_metadata || jsonb_build_object('medical_leave', jsonb_build_object('old', old.medical_leave, 'new', new.medical_leave));
        END IF;
    END IF;

    INSERT INTO public.audit_logs (clinic_id, performed_by, action, record_id, table_name, metadata)
    VALUES (v_clinic_id, v_performed_by, v_action, v_record_id, 'consultations', v_metadata);

    RETURN COALESCE(new, old);
END;
$$;


ALTER FUNCTION "public"."log_consultation_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_patient_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_clinic_id UUID;
    v_performed_by UUID;
    v_action VARCHAR(50);
    v_record_id UUID;
BEGIN
    -- Determinar clínica y autor
    IF TG_OP = 'DELETE' THEN
        v_clinic_id := old.clinic_id;
        v_record_id := old.id;
        v_action := 'DELETE_PATIENT';
    ELSE
        v_clinic_id := new.clinic_id;
        v_record_id := new.id;
        IF TG_OP = 'INSERT' THEN
            v_action := 'CREATE_PATIENT';
        ELSE
            v_action := 'EDIT_PATIENT';
        END IF;
    END IF;
    
    -- Intentar obtener el usuario actual desde la sesión de postgres (inyectada por supabase app)
    BEGIN
        v_performed_by := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_performed_by := NULL;
    END;

    -- Solo registrar si hay un usuario logueado o proceso del bot
    INSERT INTO public.audit_logs (clinic_id, performed_by, action, record_id, table_name)
    VALUES (v_clinic_id, v_performed_by, v_action, v_record_id, 'patients');
    
    RETURN COALESCE(new, old);
END;
$$;


ALTER FUNCTION "public"."log_patient_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_is_pediatric"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.is_pediatric := (new.birth_date is not null
                       and new.birth_date > (current_date - interval '19 years'));
  return new;
end; $$;


ALTER FUNCTION "public"."set_is_pediatric"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_booking_request_on_appointment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_booking_request_on_appointment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_prescription"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'valida', true,
    'fecha', pr.created_at,
    'medico', up.first_name || ' ' || up.last_name,
    'registro', up.professional_id,
    'paciente', pt.first_name || ' ' || left(pt.last_name, 1) || '.',  -- minimiza PHI
    'medicamentos', pr.medicines
  ) INTO r
  FROM prescriptions pr
  JOIN user_profiles up ON up.id = pr.doctor_id
  JOIN patients pt      ON pt.id = pr.patient_id
  WHERE pr.verification_code = p_code;

  RETURN coalesce(r, jsonb_build_object('valida', false));
END; $$;


ALTER FUNCTION "public"."verify_prescription"("p_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "doctor_id" "uuid" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" character varying(50) DEFAULT 'PENDING'::character varying,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration_minutes" integer DEFAULT 15,
    "location_id" "uuid",
    CONSTRAINT "appointments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'WAITING'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'NO_SHOW'::character varying, 'PENDING_REVIEW'::character varying])::"text"[])))
);

ALTER TABLE ONLY "public"."appointments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "performed_by" "uuid",
    "action" character varying(50) NOT NULL,
    "record_id" "uuid" NOT NULL,
    "table_name" character varying(50) NOT NULL,
    "ip_address" character varying(45),
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_rate_events" (
    "id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_rate_events" OWNER TO "postgres";


ALTER TABLE "public"."booking_rate_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."booking_rate_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."booking_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "booking_link_id" "uuid",
    "appointment_id" "uuid",
    "doctor_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "matched_patient_id" "uuid",
    "submitted_first_name" "text" NOT NULL,
    "submitted_last_name" "text" NOT NULL,
    "submitted_birth_date" "date",
    "submitted_id_card" "text",
    "submitted_phone" "text",
    "requested_at" timestamp with time zone NOT NULL,
    "status" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    "tracking_code" character varying(20) NOT NULL,
    "ip_address" character varying(45),
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "booking_requests_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::"text"[])))
);


ALTER TABLE "public"."booking_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "phone" character varying(50),
    "address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "plan_code" "text" DEFAULT 'SOLO_MEDICO'::"text" NOT NULL,
    "owner_user_id" "uuid",
    "whatsapp_phone_number_id" "text",
    "max_locations_override" integer,
    "max_doctors_override" integer,
    "max_assistants_override" integer,
    "max_storage_mb_override" integer,
    "show_record_number" boolean DEFAULT false NOT NULL,
    "logo_url" "text"
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clinics"."max_locations_override" IS 'Override por-clínica del tope de clínicas (locations). NULL = usar plans.max_locations y la regla por plan. Non-null = habilita la gestión de clínicas para este tenant con este límite.';



COMMENT ON COLUMN "public"."clinics"."max_doctors_override" IS 'Override del tope de médicos. NULL = usar plans.max_doctors.';



COMMENT ON COLUMN "public"."clinics"."max_assistants_override" IS 'Override del tope de asistentes. NULL = usar plans.max_assistants.';



COMMENT ON COLUMN "public"."clinics"."max_storage_mb_override" IS 'Override de la cuota de almacenamiento (MB). NULL = usar plans.max_storage_mb.';



CREATE TABLE IF NOT EXISTS "public"."consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "reason_for_visit" "text" NOT NULL,
    "symptoms" "text",
    "blood_pressure" character varying(20),
    "temperature" numeric(4,1),
    "weight" numeric(5,2),
    "heart_rate" integer,
    "physical_exam" "text",
    "diagnosis" "text" NOT NULL,
    "treatment_plan" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "height" numeric,
    "head_circumference" numeric,
    "medical_leave" "text",
    "oxygen_saturation" integer,
    "verification_code" character varying(100) DEFAULT ('INC-'::"text" || "upper"("substr"("md5"(("gen_random_uuid"())::"text"), 1, 9))),
    "respiratory_rate" integer,
    "referral" "text",
    "appointment_id" "uuid"
);


ALTER TABLE "public"."consultations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_schedule_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "doctor_blocks_range" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."doctor_schedule_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    CONSTRAINT "doctor_schedules_range" CHECK (("end_time" > "start_time")),
    CONSTRAINT "doctor_schedules_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);


ALTER TABLE "public"."doctor_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "consultation_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "tests" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "other_tests" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "verification_code" character varying(100)
);


ALTER TABLE "public"."lab_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_test_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lab_test_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lab_tests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lab_tests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "address" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "id_card" character varying(100),
    "gender" character(1),
    "birth_date" "date" NOT NULL,
    "phone" character varying(50),
    "email" character varying(255),
    "address" "text",
    "blood_type" character varying(10),
    "allergies" "text" DEFAULT 'Ninguna conocida'::"text",
    "family_history" "text",
    "pathological_history" "text",
    "non_pathological_history" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "is_pediatric" boolean DEFAULT false,
    "father_name" "text",
    "mother_name" "text",
    "record_number" character varying(50),
    "dob_status" "text" DEFAULT 'exact'::"text" NOT NULL,
    "source" "text" DEFAULT 'app'::"text" NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "patients_dob_status_check" CHECK (("dob_status" = ANY (ARRAY['exact'::"text", 'estimated'::"text", 'unknown'::"text"]))),
    CONSTRAINT "patients_gender_check" CHECK (("gender" = ANY (ARRAY['M'::"bpchar", 'F'::"bpchar", 'O'::"bpchar"]))),
    CONSTRAINT "patients_source_check" CHECK (("source" = ANY (ARRAY['app'::"text", 'migration'::"text"])))
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."patients"."dob_status" IS 'Confianza en birth_date: exact=real (form/DNI), estimated=derivada de edad en migración, unknown=sin dato (placeholder 1900-01-01).';



COMMENT ON COLUMN "public"."patients"."source" IS 'Procedencia de la fila: app=ingresada en el sistema, migration=importada de un Excel/respaldo.';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "max_locations" integer NOT NULL,
    "max_doctors" integer NOT NULL,
    "max_assistants" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "max_storage_mb" integer DEFAULT 1024 NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "action" character varying(50) NOT NULL,
    "target_clinic_id" "uuid",
    "target_user_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preclinical_vitals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "recorded_by" "uuid" NOT NULL,
    "blood_pressure" character varying(20),
    "temperature" numeric(4,1),
    "weight" numeric(5,2),
    "height" numeric(5,2),
    "head_circumference" numeric(4,1),
    "heart_rate" integer,
    "oxygen_saturation" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "consumed_at" timestamp with time zone,
    "consultation_id" "uuid",
    "respiratory_rate" integer
);


ALTER TABLE "public"."preclinical_vitals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "consultation_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "medicines" "jsonb" NOT NULL,
    "notes" "text",
    "pdf_url" "text",
    "verification_code" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "diagnosis" "text"
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_booking_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "token" character varying(64) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."public_booking_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."studies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "consultation_id" "uuid",
    "name" character varying(255) NOT NULL,
    "description" "text",
    "file_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "uploaded_by" "uuid"
);


ALTER TABLE "public"."studies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "section_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "patient_indication" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."study_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "consultation_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "studies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "other_studies" "text",
    "verification_code" character varying(100),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."study_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."study_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "clinic_id" "uuid",
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "role" character varying(50) DEFAULT 'DOCTOR'::character varying,
    "specialty" character varying(150),
    "professional_id" character varying(100),
    "phone" character varying(50),
    "signature_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_org_admin" boolean DEFAULT false NOT NULL,
    "default_location_id" "uuid",
    "gender" character(1),
    "practice_name" "text",
    "practice_phone" "text",
    "practice_address" "text",
    "practice_logo_url" "text",
    CONSTRAINT "user_profiles_gender_check" CHECK (("gender" = ANY (ARRAY['M'::"bpchar", 'F'::"bpchar", 'O'::"bpchar"]))),
    CONSTRAINT "user_profiles_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['ADMIN'::character varying, 'DOCTOR'::character varying, 'ASSISTANT'::character varying, 'NURSE'::character varying])::"text"[])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_rate_events"
    ADD CONSTRAINT "booking_rate_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_tracking_code_key" UNIQUE ("tracking_code");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_schedule_blocks"
    ADD CONSTRAINT "doctor_schedule_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_test_categories"
    ADD CONSTRAINT "lab_test_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lab_tests"
    ADD CONSTRAINT "lab_tests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_verification_code_key" UNIQUE ("verification_code");



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_catalog"
    ADD CONSTRAINT "study_catalog_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_requests"
    ADD CONSTRAINT "study_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_sections"
    ADD CONSTRAINT "study_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "clinics_whatsapp_phone_number_id_key" ON "public"."clinics" USING "btree" ("whatsapp_phone_number_id") WHERE ("whatsapp_phone_number_id" IS NOT NULL);



CREATE UNIQUE INDEX "consultations_verification_code_key" ON "public"."consultations" USING "btree" ("verification_code");



CREATE INDEX "idx_appointments_clinic" ON "public"."appointments" USING "btree" ("clinic_id");



CREATE INDEX "idx_appointments_clinic_id" ON "public"."appointments" USING "btree" ("clinic_id");



CREATE INDEX "idx_appointments_clinic_sched" ON "public"."appointments" USING "btree" ("clinic_id", "scheduled_at");



CREATE INDEX "idx_appointments_location" ON "public"."appointments" USING "btree" ("location_id");



CREATE INDEX "idx_appointments_patient_id" ON "public"."appointments" USING "btree" ("patient_id");



CREATE INDEX "idx_appointments_scheduled_at" ON "public"."appointments" USING "btree" ("scheduled_at");



CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "idx_audit_logs_clinic_timestamp" ON "public"."audit_logs" USING "btree" ("clinic_id", "timestamp" DESC);



CREATE INDEX "idx_booking_links_clinic" ON "public"."public_booking_links" USING "btree" ("clinic_id");



CREATE INDEX "idx_booking_requests_appointment" ON "public"."booking_requests" USING "btree" ("appointment_id");



CREATE INDEX "idx_booking_requests_clinic_status" ON "public"."booking_requests" USING "btree" ("clinic_id", "status");



CREATE INDEX "idx_booking_requests_pending_ip" ON "public"."booking_requests" USING "btree" ("doctor_id", "ip_address") WHERE (("status")::"text" = 'PENDING'::"text");



CREATE INDEX "idx_booking_requests_pending_patient" ON "public"."booking_requests" USING "btree" ("matched_patient_id") WHERE (("status")::"text" = 'PENDING'::"text");



CREATE INDEX "idx_consultations_appointment_id" ON "public"."consultations" USING "btree" ("appointment_id");



CREATE INDEX "idx_consultations_clinic" ON "public"."consultations" USING "btree" ("clinic_id");



CREATE INDEX "idx_consultations_clinic_id" ON "public"."consultations" USING "btree" ("clinic_id");



CREATE INDEX "idx_consultations_patient_id" ON "public"."consultations" USING "btree" ("patient_id");



CREATE INDEX "idx_doctor_blocks_clinic" ON "public"."doctor_schedule_blocks" USING "btree" ("clinic_id");



CREATE INDEX "idx_doctor_blocks_doctor" ON "public"."doctor_schedule_blocks" USING "btree" ("doctor_id", "end_date");



CREATE INDEX "idx_doctor_schedules_clinic" ON "public"."doctor_schedules" USING "btree" ("clinic_id");



CREATE INDEX "idx_doctor_schedules_doctor" ON "public"."doctor_schedules" USING "btree" ("doctor_id", "weekday");



CREATE INDEX "idx_doctor_schedules_location" ON "public"."doctor_schedules" USING "btree" ("location_id");



CREATE INDEX "idx_lab_orders_clinic" ON "public"."lab_orders" USING "btree" ("clinic_id");



CREATE INDEX "idx_lab_orders_consultation" ON "public"."lab_orders" USING "btree" ("consultation_id");



CREATE INDEX "idx_lab_orders_patient" ON "public"."lab_orders" USING "btree" ("patient_id");



CREATE UNIQUE INDEX "idx_lab_orders_verification_code" ON "public"."lab_orders" USING "btree" ("verification_code");



CREATE INDEX "idx_lab_test_categories_clinic" ON "public"."lab_test_categories" USING "btree" ("clinic_id");



CREATE INDEX "idx_lab_tests_category" ON "public"."lab_tests" USING "btree" ("category_id");



CREATE INDEX "idx_lab_tests_clinic" ON "public"."lab_tests" USING "btree" ("clinic_id");



CREATE INDEX "idx_locations_clinic" ON "public"."locations" USING "btree" ("clinic_id");



CREATE INDEX "idx_patients_clinic" ON "public"."patients" USING "btree" ("clinic_id");



CREATE INDEX "idx_patients_clinic_id" ON "public"."patients" USING "btree" ("clinic_id");



CREATE INDEX "idx_patients_dob_status" ON "public"."patients" USING "btree" ("clinic_id", "dob_status") WHERE ("dob_status" <> 'exact'::"text");



CREATE INDEX "idx_patients_names" ON "public"."patients" USING "btree" ("last_name", "first_name");



CREATE INDEX "idx_patients_phone" ON "public"."patients" USING "btree" ("phone");



CREATE INDEX "idx_platform_audit_created" ON "public"."platform_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_preclinical_vitals_clinic" ON "public"."preclinical_vitals" USING "btree" ("clinic_id");



CREATE INDEX "idx_preclinical_vitals_pending" ON "public"."preclinical_vitals" USING "btree" ("patient_id", "created_at" DESC) WHERE ("consumed_at" IS NULL);



CREATE INDEX "idx_prescriptions_clinic" ON "public"."prescriptions" USING "btree" ("clinic_id");



CREATE INDEX "idx_prescriptions_patient_id" ON "public"."prescriptions" USING "btree" ("patient_id");



CREATE INDEX "idx_profiles_clinic_id" ON "public"."user_profiles" USING "btree" ("clinic_id");



CREATE INDEX "idx_rate_events_bucket" ON "public"."booking_rate_events" USING "btree" ("bucket", "created_at" DESC);



CREATE INDEX "idx_studies_clinic" ON "public"."studies" USING "btree" ("clinic_id");



CREATE INDEX "idx_studies_patient_id" ON "public"."studies" USING "btree" ("patient_id");



CREATE INDEX "idx_study_catalog_clinic" ON "public"."study_catalog" USING "btree" ("clinic_id");



CREATE INDEX "idx_study_catalog_section" ON "public"."study_catalog" USING "btree" ("section_id");



CREATE INDEX "idx_study_requests_clinic" ON "public"."study_requests" USING "btree" ("clinic_id");



CREATE INDEX "idx_study_requests_consultation" ON "public"."study_requests" USING "btree" ("consultation_id");



CREATE INDEX "idx_study_requests_patient" ON "public"."study_requests" USING "btree" ("patient_id");



CREATE INDEX "idx_study_sections_clinic" ON "public"."study_sections" USING "btree" ("clinic_id");



CREATE INDEX "idx_user_profiles_clinic" ON "public"."user_profiles" USING "btree" ("clinic_id");



CREATE UNIQUE INDEX "uniq_booking_link_active" ON "public"."public_booking_links" USING "btree" ("doctor_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE "is_active";



CREATE UNIQUE INDEX "uniq_doctor_schedule" ON "public"."doctor_schedules" USING "btree" ("doctor_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "weekday", "start_time", "end_time");



CREATE UNIQUE INDEX "uq_study_catalog_section_name" ON "public"."study_catalog" USING "btree" ("section_id", "name");



CREATE UNIQUE INDEX "uq_study_sections_clinic_name" ON "public"."study_sections" USING "btree" ("clinic_id", "name");



CREATE OR REPLACE TRIGGER "on_appointment_booking_sync_delete" BEFORE DELETE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_booking_request_on_appointment"();



CREATE OR REPLACE TRIGGER "on_appointment_booking_sync_update" AFTER UPDATE OF "status" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."sync_booking_request_on_appointment"();



CREATE OR REPLACE TRIGGER "on_appointment_modified" AFTER INSERT OR DELETE OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."log_appointment_change"();



CREATE OR REPLACE TRIGGER "on_consultation_modified" AFTER INSERT OR DELETE OR UPDATE ON "public"."consultations" FOR EACH ROW EXECUTE FUNCTION "public"."log_consultation_change"();



CREATE OR REPLACE TRIGGER "on_patient_modified" AFTER INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."log_patient_change"();



CREATE OR REPLACE TRIGGER "trg_audit_consultations" AFTER INSERT OR DELETE OR UPDATE ON "public"."consultations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_patients" AFTER INSERT OR DELETE OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_prescriptions" AFTER INSERT OR DELETE OR UPDATE ON "public"."prescriptions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"();



CREATE OR REPLACE TRIGGER "trg_audit_studies" AFTER INSERT OR DELETE OR UPDATE ON "public"."studies" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"();



CREATE OR REPLACE TRIGGER "trg_enforce_location_limits" BEFORE INSERT ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_location_limits"();



CREATE OR REPLACE TRIGGER "trg_enforce_user_limits" BEFORE INSERT ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_user_limits"();



CREATE OR REPLACE TRIGGER "trg_guard_clinic" BEFORE UPDATE ON "public"."clinics" FOR EACH ROW EXECUTE FUNCTION "public"."guard_clinic_changes"();



CREATE OR REPLACE TRIGGER "trg_guard_user_profile" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_user_profile_changes"();



CREATE OR REPLACE TRIGGER "trg_set_is_pediatric" BEFORE INSERT OR UPDATE OF "birth_date" ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."set_is_pediatric"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_booking_link_id_fkey" FOREIGN KEY ("booking_link_id") REFERENCES "public"."public_booking_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_matched_patient_id_fkey" FOREIGN KEY ("matched_patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code");



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedule_blocks"
    ADD CONSTRAINT "doctor_schedule_blocks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedule_blocks"
    ADD CONSTRAINT "doctor_schedule_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."doctor_schedule_blocks"
    ADD CONSTRAINT "doctor_schedule_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."lab_orders"
    ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_test_categories"
    ADD CONSTRAINT "lab_test_categories_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_tests"
    ADD CONSTRAINT "lab_tests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."lab_test_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lab_tests"
    ADD CONSTRAINT "lab_tests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_target_clinic_id_fkey" FOREIGN KEY ("target_clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preclinical_vitals"
    ADD CONSTRAINT "preclinical_vitals_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_booking_links"
    ADD CONSTRAINT "public_booking_links_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."studies"
    ADD CONSTRAINT "studies_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."study_catalog"
    ADD CONSTRAINT "study_catalog_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_catalog"
    ADD CONSTRAINT "study_catalog_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."study_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_requests"
    ADD CONSTRAINT "study_requests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_requests"
    ADD CONSTRAINT "study_requests_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_requests"
    ADD CONSTRAINT "study_requests_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."study_requests"
    ADD CONSTRAINT "study_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_sections"
    ADD CONSTRAINT "study_sections_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_all" ON "public"."appointments" USING (("clinic_id" = "public"."current_clinic_id"())) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "appointments_delete" ON "public"."appointments" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "appointments_insert" ON "public"."appointments" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "appointments_select" ON "public"."appointments" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "appointments_update" ON "public"."appointments" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_read" ON "public"."audit_logs" FOR SELECT USING (((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()) OR "public"."is_platform_admin"()));



CREATE POLICY "booking_links_policy" ON "public"."public_booking_links" TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"())) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."booking_rate_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_requests_select" ON "public"."booking_requests" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "booking_requests_update" ON "public"."booking_requests" FOR UPDATE TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"())) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinics_select" ON "public"."clinics" FOR SELECT USING (("id" = "public"."current_clinic_id"()));



CREATE POLICY "clinics_update" ON "public"."clinics" FOR UPDATE USING ((("id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"())) WITH CHECK ((("id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()));



ALTER TABLE "public"."consultations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultations_delete" ON "public"."consultations" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "consultations_insert" ON "public"."consultations" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "consultations_select" ON "public"."consultations" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "consultations_update" ON "public"."consultations" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "doctor_blocks_policy" ON "public"."doctor_schedule_blocks" TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"())) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."doctor_schedule_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."doctor_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "doctor_schedules_select" ON "public"."doctor_schedules" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "doctor_schedules_write" ON "public"."doctor_schedules" TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"())) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."lab_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_orders_policy" ON "public"."lab_orders" USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."lab_test_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_test_categories_policy" ON "public"."lab_test_categories" USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."lab_tests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lab_tests_policy" ON "public"."lab_tests" USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete" ON "public"."locations" FOR DELETE USING ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()));



CREATE POLICY "locations_insert" ON "public"."locations" FOR INSERT WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()));



CREATE POLICY "locations_select" ON "public"."locations" FOR SELECT USING (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "locations_update" ON "public"."locations" FOR UPDATE USING ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"())) WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients_delete" ON "public"."patients" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "patients_insert" ON "public"."patients" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "patients_select" ON "public"."patients" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "patients_update" ON "public"."patients" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_read" ON "public"."plans" FOR SELECT USING (true);



ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_audit_read" ON "public"."platform_audit_logs" FOR SELECT USING ("public"."is_platform_admin"());



ALTER TABLE "public"."preclinical_vitals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preclinical_vitals_policy" ON "public"."preclinical_vitals" USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prescriptions_delete" ON "public"."prescriptions" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "prescriptions_insert" ON "public"."prescriptions" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "prescriptions_select" ON "public"."prescriptions" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "prescriptions_update" ON "public"."prescriptions" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "profiles_insert_admin" ON "public"."user_profiles" FOR INSERT WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()));



CREATE POLICY "profiles_select_clinic" ON "public"."user_profiles" FOR SELECT USING (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "profiles_update" ON "public"."user_profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR (("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_org_admin_now"()))) WITH CHECK (("clinic_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."public_booking_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."studies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "studies_delete" ON "public"."studies" FOR DELETE USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."is_org_admin_now"() OR (("uploaded_by" = "auth"."uid"()) AND ("public"."current_user_role"() = 'DOCTOR'::"text")))));



CREATE POLICY "studies_insert" ON "public"."studies" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "studies_select" ON "public"."studies" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "studies_update" ON "public"."studies" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."study_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "study_catalog_delete" ON "public"."study_catalog" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_catalog_insert" ON "public"."study_catalog" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_catalog_select" ON "public"."study_catalog" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_catalog_update" ON "public"."study_catalog" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."study_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "study_requests_delete" ON "public"."study_requests" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_requests_insert" ON "public"."study_requests" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_requests_select" ON "public"."study_requests" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_requests_update" ON "public"."study_requests" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."study_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "study_sections_delete" ON "public"."study_sections" FOR DELETE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_sections_insert" ON "public"."study_sections" FOR INSERT WITH CHECK (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_sections_select" ON "public"."study_sections" FOR SELECT USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "study_sections_update" ON "public"."study_sections" FOR UPDATE USING (("clinic_id" = ( SELECT "user_profiles"."clinic_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."appointments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."preclinical_vitals";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."admin_platform_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_platform_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_platform_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_tenant_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_tenant_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_tenant_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clinic_report"("p_days" integer, "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."clinic_report"("p_days" integer, "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinic_report"("p_days" integer, "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."clinic_report_detail"("p_tipo" "text", "p_days" integer, "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."clinic_report_detail"("p_tipo" "text", "p_days" integer, "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinic_report_detail"("p_tipo" "text", "p_days" integer, "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."clinic_storage_bytes"() TO "anon";
GRANT ALL ON FUNCTION "public"."clinic_storage_bytes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinic_storage_bytes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_public_booking"("p_link_id" "uuid", "p_matched_patient_id" "uuid", "p_scheduled_at" timestamp with time zone, "p_first_name" "text", "p_last_name" "text", "p_birth_date" "date", "p_id_card" "text", "p_phone" "text", "p_tracking_code" "text", "p_ip" character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_public_booking"("p_link_id" "uuid", "p_matched_patient_id" "uuid", "p_scheduled_at" timestamp with time zone, "p_first_name" "text", "p_last_name" "text", "p_birth_date" "date", "p_id_card" "text", "p_phone" "text", "p_tracking_code" "text", "p_ip" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_location_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_location_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_location_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_user_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_user_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_user_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_clinic"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_clinic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_clinic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_clinic_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_clinic_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_clinic_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_user_profile_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_user_profile_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_user_profile_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin_now"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin_now"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin_now"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_appointment_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_appointment_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_appointment_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" character varying, "p_record_id" "uuid", "p_table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" character varying, "p_record_id" "uuid", "p_table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_action" character varying, "p_record_id" "uuid", "p_table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."log_consultation_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_consultation_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_consultation_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_patient_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_patient_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_patient_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_is_pediatric"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_is_pediatric"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_is_pediatric"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_booking_request_on_appointment"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_booking_request_on_appointment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_booking_request_on_appointment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_prescription"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_prescription"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_prescription"("p_code" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."booking_rate_events" TO "anon";
GRANT ALL ON TABLE "public"."booking_rate_events" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_rate_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."booking_rate_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."booking_rate_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."booking_rate_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."booking_requests" TO "anon";
GRANT ALL ON TABLE "public"."booking_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_requests" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."consultations" TO "anon";
GRANT ALL ON TABLE "public"."consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."consultations" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_schedule_blocks" TO "anon";
GRANT ALL ON TABLE "public"."doctor_schedule_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_schedule_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_schedules" TO "anon";
GRANT ALL ON TABLE "public"."doctor_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."lab_orders" TO "anon";
GRANT ALL ON TABLE "public"."lab_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_orders" TO "service_role";



GRANT ALL ON TABLE "public"."lab_test_categories" TO "anon";
GRANT ALL ON TABLE "public"."lab_test_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_test_categories" TO "service_role";



GRANT ALL ON TABLE "public"."lab_tests" TO "anon";
GRANT ALL ON TABLE "public"."lab_tests" TO "authenticated";
GRANT ALL ON TABLE "public"."lab_tests" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";



GRANT ALL ON TABLE "public"."platform_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."preclinical_vitals" TO "anon";
GRANT ALL ON TABLE "public"."preclinical_vitals" TO "authenticated";
GRANT ALL ON TABLE "public"."preclinical_vitals" TO "service_role";



GRANT ALL ON TABLE "public"."prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."public_booking_links" TO "anon";
GRANT ALL ON TABLE "public"."public_booking_links" TO "authenticated";
GRANT ALL ON TABLE "public"."public_booking_links" TO "service_role";



GRANT ALL ON TABLE "public"."studies" TO "anon";
GRANT ALL ON TABLE "public"."studies" TO "authenticated";
GRANT ALL ON TABLE "public"."studies" TO "service_role";



GRANT ALL ON TABLE "public"."study_catalog" TO "anon";
GRANT ALL ON TABLE "public"."study_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."study_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."study_requests" TO "anon";
GRANT ALL ON TABLE "public"."study_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."study_requests" TO "service_role";



GRANT ALL ON TABLE "public"."study_sections" TO "anon";
GRANT ALL ON TABLE "public"."study_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."study_sections" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































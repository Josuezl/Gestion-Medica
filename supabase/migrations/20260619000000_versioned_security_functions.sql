-- Versionado de las funciones de seguridad que vivían SOLO en la base de datos (hallazgo A2).
-- Estas funciones son el corazón del aislamiento multi-tenant (RLS) y del gating de superadmin.
-- Definiciones EXPORTADAS VERBATIM desde producción (pg_get_functiondef) el 2026-06-19, para que
-- el modelo de seguridad quede en el control de versiones, sea auditable y reproducible (DR).
-- Son idempotentes (create or replace): re-ejecutarlas no cambia nada (coinciden con producción).
--
-- NOTA (bug latente detectado, NO corregido aquí para no divergir de producción): en
-- admin_platform_summary() el cálculo de 'almacenamiento_bytes' consulta los buckets
-- 'recetas','estudios','firmas', que NO existen (los reales son 'prescriptions','medical-studies',
-- 'signatures'); por eso ese total siempre da 0. Ver hallazgo separado en auditoria_tecnica.md.

CREATE OR REPLACE FUNCTION public.current_clinic_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT clinic_id FROM user_profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin_now()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT is_org_admin FROM user_profiles WHERE id = auth.uid()), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.admin_platform_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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
                            FROM storage.objects WHERE bucket_id = ANY (ARRAY['recetas','estudios','firmas']))
  ) INTO result;
  RETURN result;
END; $function$;

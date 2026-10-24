-- Fix: admin_tenant_overview fallaba siempre con
--   42804 "structure of query does not match function result type"
--   "Returned type character varying(255) does not match expected type text in column 2"
--
-- Dos mismatches de tipo en RETURNS TABLE (Postgres es estricto):
--   1) clinic_name/plan_code declarados text, pero clinics.name es character varying(255).
--   2) storage_bytes declarado bigint, pero sum(bigint) en Postgres devuelve numeric.
-- Por eso el panel /superadmin mostraba la tabla de tenants vacía aunque sí había clínicas.
--
-- Solución: castear c.name y c.plan_code a text, y el coalesce(sum(...)) a bigint.

CREATE OR REPLACE FUNCTION public.admin_tenant_overview()
 RETURNS TABLE(clinic_id uuid, clinic_name text, plan_code text, doctors integer, assistants integer, patients integer, storage_bytes bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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
END; $function$;

-- B5: admin_platform_summary() calculaba 'almacenamiento_bytes' sobre buckets que NO existen
-- ('recetas','estudios','firmas') → el total del panel superadmin siempre daba 0.
-- Se corrigen a los buckets reales: 'prescriptions','medical-studies','signatures'.
-- (Reemplaza la definición versionada en 20260619000000_versioned_security_functions.sql.)

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
                            FROM storage.objects WHERE bucket_id = ANY (ARRAY['prescriptions','medical-studies','signatures']))
  ) INTO result;
  RETURN result;
END; $function$;

-- Bitácora de auditoría a nivel PLATAFORMA (acciones del platform admin / superadmin).
--
-- A diferencia de public.audit_logs (tenant-scoped: clinic_id NOT NULL y performed_by FK a
-- user_profiles), estos eventos los genera el dueño de la plataforma, que puede NO tener
-- una fila en user_profiles. Por eso se registra el actor contra auth.users y los objetivos
-- (clínica / usuario) quedan opcionales.
--
-- Aplicar en el SQL Editor de Supabase (o vía psql) sobre el proyecto.

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action          varchar(50) NOT NULL,   -- PROVISION_TENANT, CHANGE_PLAN, RESEND_INVITE
  target_clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  target_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created
  ON public.platform_audit_logs (created_at DESC);

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- Solo el platform admin puede leer. No se definen políticas de INSERT/UPDATE/DELETE:
-- con RLS activo y sin esas políticas, anon/authenticated quedan denegados por defecto;
-- las escrituras ocurren exclusivamente desde el servidor con la service_role key
-- (que ignora RLS), igual que el patrón de public.audit_logs.
DROP POLICY IF EXISTS platform_audit_read ON public.platform_audit_logs;
CREATE POLICY platform_audit_read ON public.platform_audit_logs
  FOR SELECT USING ( public.is_platform_admin() );

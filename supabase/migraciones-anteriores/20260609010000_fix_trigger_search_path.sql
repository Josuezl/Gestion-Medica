-- Fix: "Database error creating new user" al crear cualquier usuario vía Supabase Auth.
--
-- Causa: las funciones de trigger del camino de alta de usuario corrían con el search_path
-- del rol supabase_auth_admin (que NO incluye 'public'). enforce_user_limits referencia
-- clinics/plans/user_profiles sin calificar el esquema, por lo que fallaba con
-- "relation does not exist" y abortaba el INSERT en auth.users. (En el SQL Editor no se
-- notaba porque ahí se ejecuta como 'postgres', cuyo search_path sí incluye 'public'.)
--
-- Solución: fijar SET search_path = public, pg_temp en las funciones que participan en la
-- creación del usuario. Best practice de Supabase para toda función SECURITY DEFINER / trigger.

CREATE OR REPLACE FUNCTION public.enforce_user_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
DECLARE v_plan plans%ROWTYPE; v_count INT;
BEGIN
  SELECT p.* INTO v_plan FROM clinics c JOIN plans p ON p.code = c.plan_code WHERE c.id = NEW.clinic_id;
  IF v_plan.code IS NULL THEN RETURN NEW; END IF;

  IF NEW.role = 'DOCTOR' THEN
    SELECT count(*) INTO v_count FROM user_profiles WHERE clinic_id = NEW.clinic_id AND role = 'DOCTOR';
    IF v_count >= v_plan.max_doctors THEN
      RAISE EXCEPTION 'Límite de médicos del plan alcanzado (máx %).', v_plan.max_doctors;
    END IF;
  ELSIF NEW.role = 'ASSISTANT' THEN
    SELECT count(*) INTO v_count FROM user_profiles WHERE clinic_id = NEW.clinic_id AND role = 'ASSISTANT';
    IF v_count >= v_plan.max_assistants THEN
      RAISE EXCEPTION 'Límite de asistentes del plan alcanzado (máx %).', v_plan.max_assistants;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
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
$function$;

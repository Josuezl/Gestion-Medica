-- Auditoría automática del flujo de CITAS y CONSULTAS (quién crea/edita/cambia estado/elimina).
-- Se hace con triggers de BD (igual que `on_patient_modified`/`log_patient_change` en schema.sql) para
-- capturar TODOS los caminos sin instrumentar cada función: dropdown de estado, formulario de edición,
-- el auto-COMPLETED al guardar una consulta, e incluso el bot de WhatsApp (que usa service_role).
-- `performed_by` sale de auth.uid(); en acciones de sistema/bot queda NULL.
-- Requiere para `appointments`: 20260628000000 (no), y para consultas: la columna appointment_id de esa
-- migración previa. Aplicar DESPUÉS de 20260628000000_consultations_appointment_id.sql.

-- 1. Columna para guardar el detalle del cambio (old/new). audit_logs no la tenía.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2. Trigger de auditoría de CITAS.
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_appointment_modified
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();

-- 3. Trigger de auditoría de CONSULTAS (quién registró/editó/eliminó y para qué cita).
CREATE OR REPLACE FUNCTION public.log_consultation_change()
RETURNS trigger AS $$
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
    END IF;

    INSERT INTO public.audit_logs (clinic_id, performed_by, action, record_id, table_name, metadata)
    VALUES (v_clinic_id, v_performed_by, v_action, v_record_id, 'consultations', v_metadata);

    RETURN COALESCE(new, old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_consultation_modified
    AFTER INSERT OR UPDATE OR DELETE ON consultations
    FOR EACH ROW EXECUTE FUNCTION public.log_consultation_change();

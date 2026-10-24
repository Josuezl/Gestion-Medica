-- Enriquece la auditoría de consultas para que, al CORREGIR la incapacidad (medical_leave) de una
-- consulta ya guardada, quede registrado el cambio old->new en audit_logs.metadata.
-- Contexto: se agregó un botón "Nueva Incapacidad" en el expediente que escribe SOLO la columna
-- medical_leave de la última consulta (no edita lo clínico). Si esa incapacidad ya existía y se
-- corrige, el médico puede hacerlo, pero debe quedar rastro de qué cambió y quién (decisión médica
-- acordada). El trigger on_consultation_modified sigue apuntando a esta función; solo se reemplaza.

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

        -- En UPDATE, si cambió la incapacidad, registrar el detalle old->new.
        IF TG_OP = 'UPDATE' AND new.medical_leave IS DISTINCT FROM old.medical_leave THEN
            v_metadata := v_metadata || jsonb_build_object('medical_leave', jsonb_build_object('old', old.medical_leave, 'new', new.medical_leave));
        END IF;
    END IF;

    INSERT INTO public.audit_logs (clinic_id, performed_by, action, record_id, table_name, metadata)
    VALUES (v_clinic_id, v_performed_by, v_action, v_record_id, 'consultations', v_metadata);

    RETURN COALESCE(new, old);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

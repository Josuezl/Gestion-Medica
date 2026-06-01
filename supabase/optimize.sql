-- Optimización de Rendimiento y Auditoría de Seguridad para MedConnect

-- 1. CREACIÓN DE ÍNDICES PARA BÚSQUEDAS RÁPIDAS Y RENDIMIENTO DE RLS
-- Estos índices mejoran dramáticamente la velocidad al filtrar por clinic_id en las políticas RLS.

-- Indexación en Patients
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone); -- Crucial para Webhook de WhatsApp
CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(last_name, first_name); -- Búsquedas en listado

-- Indexación en Appointments (Citas)
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at); -- Sincronización de calendario y cron recordatorios
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Indexación en Consultas
CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id); -- Carga del expediente
CREATE INDEX IF NOT EXISTS idx_consultations_clinic_id ON consultations(clinic_id);

-- Indexación en Recetas y Estudios
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_studies_patient_id ON studies(patient_id);

-- Indexación en Perfiles de Usuario
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON user_profiles(clinic_id);

-- Indexación en Bitácora de Auditoría
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_timestamp ON audit_logs(clinic_id, timestamp DESC);


-- 2. PROCEDIMIENTOS DE AUDITORÍA DE SEGURIDAD (CYBERSECURITY AUDIT)
-- ¿Cómo verificar quién ha accedido a los datos de salud protegidos (PHI)?

-- Consulta de ejemplo para el Oficial de Seguridad de la Clínica:
-- "Ver todos los cambios y accesos de expedientes realizados en las últimas 24 horas"
/*
SELECT 
    l.timestamp,
    p.first_name || ' ' || p.last_name AS realizado_por,
    p.role AS rol,
    l.action,
    l.table_name,
    l.record_id,
    l.ip_address
FROM audit_logs l
LEFT JOIN user_profiles p ON l.performed_by = p.id
WHERE l.timestamp >= now() - interval '24 hours'
ORDER BY l.timestamp DESC;
*/


-- 3. PRUEBAS DE VULNERABILIDAD RLS (PENETRATION TESTING SIMULATION)
-- Ejecutar las siguientes pruebas en el editor SQL para validar que RLS bloquea accesos no autorizados.

/*
-- Paso 1: Configurar una sesión simulando un Doctor A (Reemplazar 'doctor-a-uuid' con un ID real)
SET request.jwt.claim.sub = 'doctor-a-uuid';

-- Paso 2: Intentar consultar pacientes. Supabase aplicará RLS.
SELECT * FROM patients; 
-- Resultado esperado: Solo debe retornar pacientes pertenecientes al clinic_id del Doctor A.

-- Paso 3: Intentar actualizar un expediente de la Clínica B simulando ser de la Clínica A.
-- (Si se ejecuta un UPDATE que viola la política, PostgreSQL retornará 0 filas afectadas o error de permisos).
UPDATE patients 
SET allergies = 'Modificación Maliciosa RLS' 
WHERE clinic_id = 'id-clinica-b-uuid';
-- Resultado esperado: 0 filas actualizadas (RLS previene la mutación).
*/

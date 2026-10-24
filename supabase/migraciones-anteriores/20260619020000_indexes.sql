-- A2 (opcional): formaliza como migración los índices de rendimiento que vivían en
-- supabase/optimize.sql (aplicado a mano). Idempotente (CREATE INDEX IF NOT EXISTS): en producción
-- es un no-op porque ya existen; sirve para reproducir el esquema desde cero (DR / nuevos entornos).

-- Patients
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_names ON patients(last_name, first_name);

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Consultations
CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_clinic_id ON consultations(clinic_id);

-- Prescriptions / Studies
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_studies_patient_id ON studies(patient_id);

-- User profiles
CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON user_profiles(clinic_id);

-- Audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_timestamp ON audit_logs(clinic_id, timestamp DESC);

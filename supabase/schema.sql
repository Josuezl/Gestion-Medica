-- Base de datos para MedConnect - Gestión Médica Inteligente

-- Habilitar la extensión pgcrypto para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Clínicas
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Perfiles de Usuario (Médicos, Asistentes, Admins)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY, -- Relacionado con auth.users(id)
    clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('ADMIN', 'DOCTOR', 'ASSISTANT')) DEFAULT 'DOCTOR',
    specialty VARCHAR(150),
    professional_id VARCHAR(100), -- CMH en Honduras
    phone VARCHAR(50),
    signature_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Pacientes
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    id_card VARCHAR(100), -- Tarjeta de Identidad
    gender CHAR(1) CHECK (gender IN ('M', 'F', 'O')),
    birth_date DATE NOT NULL,
    phone VARCHAR(50) NOT NULL, -- Formato: +504XXXXXXXX
    email VARCHAR(255),
    address TEXT,
    blood_type VARCHAR(10),
    allergies TEXT DEFAULT 'Ninguna conocida',
    family_history TEXT,
    pathological_history TEXT,
    non_pathological_history TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabla de Consultas Clínicas (Historias Clínicas)
CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    reason_for_visit TEXT NOT NULL,
    symptoms TEXT,
    blood_pressure VARCHAR(20),
    temperature NUMERIC(4,1), -- Ej. 37.5
    weight NUMERIC(5,2), -- Ej. 75.50 kg
    heart_rate INTEGER, -- bpm
    oxygen_saturation INTEGER, -- SpO2 (%)
    physical_exam TEXT,
    diagnosis TEXT NOT NULL,
    treatment_plan TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabla de Estudios Médicos
CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    file_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabla de Recetas Médicas
CREATE TABLE prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    medicines JSONB NOT NULL, -- [{name: 'Acetaminofén', dose: '500mg', frequency: 'Cada 8 horas', duration: '5 días'}]
    notes TEXT,
    pdf_url TEXT,
    verification_code VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabla de Citas (Agendamiento)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE, -- Nulo si es agendamiento en proceso por WhatsApp
    doctor_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) CHECK (status IN ('PENDING', 'CONFIRMED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabla de Bitácora de Auditoría
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    performed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'READ_PATIENT', 'CREATE_PATIENT', 'EDIT_PATIENT', 'DELETE_PATIENT', 'READ_CONSULTATION'
    record_id UUID NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- HABILITAR ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- DEFINICIÓN DE POLÍTICAS DE RLS PARA MULTI-INQUILINO (TENANT ISOLATION)
-- Nota: Se asume que el id del usuario autenticado mapea a user_profiles para obtener su clinic_id

-- 1. Políticas para user_profiles
CREATE POLICY "user_profiles_policy" ON user_profiles
    FOR ALL USING (id = auth.uid() OR clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 2. Políticas para clinics
CREATE POLICY "clinics_policy" ON clinics
    FOR ALL USING (id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 3. Políticas para patients
CREATE POLICY "patients_policy" ON patients
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 4. Políticas para consultations
CREATE POLICY "consultations_policy" ON consultations
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 5. Políticas para studies
CREATE POLICY "studies_policy" ON studies
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 6. Políticas para prescriptions
CREATE POLICY "prescriptions_policy" ON prescriptions
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 7. Políticas para appointments
CREATE POLICY "appointments_policy" ON appointments
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- 8. Políticas para audit_logs
CREATE POLICY "audit_logs_policy" ON audit_logs
    FOR ALL USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));


-- TRIGGERS DE SEGURIDAD Y CONFIGURACIÓN AUTOMÁTICA DE PERFILES
-- Crear perfil de usuario automáticamente al registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger al crear un auth.user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- TRIGGER PARA BITÁCORA DE AUDITORÍA AUTOMÁTICA EN EXPEDIENTES
CREATE OR REPLACE FUNCTION public.log_patient_change()
RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_patient_modified
    AFTER INSERT OR UPDATE OR DELETE ON patients
    FOR EACH ROW EXECUTE FUNCTION public.log_patient_change();

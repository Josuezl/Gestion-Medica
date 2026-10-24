-- Migración: Fix RLS policies para soportar INSERT en todas las tablas
-- El problema: FOR ALL USING (...) solo aplica la condición a SELECT/UPDATE/DELETE.
-- Para INSERT se necesita una cláusula WITH CHECK explícita.
-- Sin WITH CHECK, Supabase bloquea cualquier INSERT aunque el usuario tenga permisos.

-- =========================================================
-- Recrear políticas con WITH CHECK para todas las tablas
-- que aceptan INSERT desde el servidor (server actions)
-- =========================================================

-- studies
DROP POLICY IF EXISTS "studies_policy" ON studies;
CREATE POLICY "studies_select_update_delete" ON studies
    FOR SELECT USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "studies_insert" ON studies
    FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "studies_update" ON studies
    FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "studies_delete" ON studies
    FOR DELETE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- consultations (por si acaso)
DROP POLICY IF EXISTS "consultations_policy" ON consultations;
CREATE POLICY "consultations_select" ON consultations
    FOR SELECT USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "consultations_insert" ON consultations
    FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "consultations_update" ON consultations
    FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "consultations_delete" ON consultations
    FOR DELETE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- prescriptions (por si acaso)
DROP POLICY IF EXISTS "prescriptions_policy" ON prescriptions;
CREATE POLICY "prescriptions_select" ON prescriptions
    FOR SELECT USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "prescriptions_insert" ON prescriptions
    FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "prescriptions_update" ON prescriptions
    FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "prescriptions_delete" ON prescriptions
    FOR DELETE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- appointments (por si acaso)
DROP POLICY IF EXISTS "appointments_policy" ON appointments;
CREATE POLICY "appointments_select" ON appointments
    FOR SELECT USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "appointments_insert" ON appointments
    FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "appointments_update" ON appointments
    FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "appointments_delete" ON appointments
    FOR DELETE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

-- patients (por si acaso)
DROP POLICY IF EXISTS "patients_policy" ON patients;
CREATE POLICY "patients_select" ON patients
    FOR SELECT USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "patients_insert" ON patients
    FOR INSERT WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "patients_update" ON patients
    FOR UPDATE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "patients_delete" ON patients
    FOR DELETE USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = auth.uid()));

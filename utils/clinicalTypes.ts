import type { Medicine } from '@/utils/medicines'

/**
 * Tipos de las filas del dominio clínico tal como las consumen las pantallas (schema.sql +
 * migraciones). No se generan de la BD: se mantienen a mano y son deliberadamente laxos
 * (casi todo opcional/nullable) para tolerar el drift repo↔BD sin mentir en lo esencial.
 */

/** Join de user_profiles que acompaña consultas/recetas/órdenes (para "Dr./Dra. X"). */
export interface DoctorRef {
  first_name?: string | null
  last_name?: string | null
  gender?: string | null
}

export interface PatientRow {
  id: string
  clinic_id?: string
  first_name: string
  last_name: string
  id_card?: string | null
  gender?: string | null
  birth_date?: string | null
  /** 'exact' | 'unknown' — pacientes migrados sin fecha de nacimiento confiable. */
  dob_status?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  blood_type?: string | null
  allergies?: string | null
  family_history?: string | null
  pathological_history?: string | null
  non_pathological_history?: string | null
  record_number?: string | null
  is_pediatric?: boolean | null
  father_name?: string | null
  mother_name?: string | null
  created_at?: string
}

export interface PrescriptionRow {
  id: string
  clinic_id?: string
  patient_id?: string
  consultation_id?: string | null
  doctor_id?: string
  medicines: Medicine[] | null
  notes?: string | null
  diagnosis?: string | null
  pdf_url?: string | null
  verification_code?: string | null
  created_at: string
  user_profiles?: DoctorRef | null
}

export interface ConsultationRow {
  id: string
  clinic_id?: string
  patient_id?: string
  doctor_id?: string
  appointment_id?: string | null
  reason_for_visit?: string | null
  symptoms?: string | null
  blood_pressure?: string | null
  temperature?: number | null
  weight?: number | null
  height?: number | null
  head_circumference?: number | null
  heart_rate?: number | null
  respiratory_rate?: number | null
  oxygen_saturation?: number | null
  physical_exam?: string | null
  diagnosis?: string | null
  treatment_plan?: string | null
  medical_leave?: string | null
  referral?: string | null
  verification_code?: string | null
  created_at: string
  user_profiles?: DoctorRef | null
  prescriptions?: PrescriptionRow[] | null
}

export interface StudyRow {
  id: string
  clinic_id?: string
  patient_id?: string
  consultation_id?: string | null
  name: string
  description?: string | null
  file_url?: string | null
  uploaded_by?: string | null
  created_at: string
}

export interface LabTestItem {
  category: string
  name: string
}

export interface LabOrderRow {
  id: string
  clinic_id?: string
  patient_id?: string
  consultation_id?: string | null
  doctor_id?: string
  tests: LabTestItem[] | null
  other_tests?: string | null
  verification_code?: string | null
  created_at: string
  user_profiles?: DoctorRef | null
}

export interface StudyRequestItem {
  section: string
  name: string
  description?: string | null
  indication?: string | null
}

export interface StudyRequestRow {
  id: string
  clinic_id?: string
  patient_id?: string
  consultation_id?: string | null
  doctor_id?: string
  studies: StudyRequestItem[] | null
  other_studies?: string | null
  verification_code?: string | null
  created_at: string
  user_profiles?: DoctorRef | null
}

/** Fila de user_profiles con los datos que usan los documentos con membrete. */
export interface DoctorProfileRow {
  id?: string
  first_name?: string | null
  last_name?: string | null
  gender?: string | null
  specialty?: string | null
  professional_id?: string | null
  signature_url?: string | null
  practice_name?: string | null
  practice_phone?: string | null
  practice_address?: string | null
  practice_logo_url?: string | null
}

/** Fila de clinics con los datos del membrete. */
export interface ClinicRow {
  id?: string
  name?: string | null
  phone?: string | null
  address?: string | null
  logo_url?: string | null
}

/** Fila de preclinical_vitals (signos tomados por enfermería antes de la consulta). */
export interface PreclinicalVitalsRow {
  id: string
  patient_id?: string
  blood_pressure?: string | null
  temperature?: number | null
  weight?: number | null
  height?: number | null
  head_circumference?: number | null
  heart_rate?: number | null
  respiratory_rate?: number | null
  oxygen_saturation?: number | null
  notes?: string | null
  created_at: string
  /** Join user_profiles!recorded_by: quién tomó los signos. */
  recorded_by_profile?: { first_name?: string | null; last_name?: string | null } | null
}

/**
 * Documento compartible por WhatsApp/enlace público (receta, orden de laboratorio, incapacidad,
 * referencia o solicitud de estudios): lo mínimo que necesita el modal de compartir.
 */
export interface ShareableDoc {
  id: string
  verification_code?: string | null
  user_profiles?: DoctorRef | null
}

/** Fila reducida de consultations para la lista de incapacidades (solo columnas no sensibles). */
export interface MedicalLeaveRow {
  id: string
  created_at: string
  verification_code?: string | null
  medical_leave?: string | null
  user_profiles?: DoctorRef | null
}

/** Fila reducida de consultations para la lista de referencias (solo columnas no sensibles). */
export interface ReferralRow {
  id: string
  created_at: string
  verification_code?: string | null
  referral?: string | null
  user_profiles?: DoctorRef | null
}

-- Índices de rendimiento (P0-1 y P0-3.2 de revision_tecnica_2026-07-05.md).
-- Solo agrega índices: se puede aplicar antes o después del deploy del código sin romper nada.

-- P0-1 · Consulta caliente del dashboard/agenda: citas de la clínica por rango de fechas.
-- Los índices separados por columna obligaban a un BitmapAnd; el compuesto resuelve el
-- filtro (clinic_id, scheduled_at) en un solo recorrido.
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_scheduled
  ON appointments (clinic_id, scheduled_at);

-- P0-3.2 · Búsqueda de pacientes/consultas con ilike '%…%': el comodín inicial no puede usar
-- índices btree (cada búsqueda era un seq scan por palabra). pg_trgm + GIN indexa por
-- trigramas y sirve ilike con comodín en ambos extremos. El or() entre columnas se resuelve
-- con BitmapOr de estos índices.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_patients_first_name_trgm
  ON patients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_last_name_trgm
  ON patients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_id_card_trgm
  ON patients USING gin (id_card gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm
  ON patients USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_record_number_trgm
  ON patients USING gin (record_number gin_trgm_ops);

-- Búsqueda del historial de consultas (diagnóstico / motivo de visita).
CREATE INDEX IF NOT EXISTS idx_consultations_diagnosis_trgm
  ON consultations USING gin (diagnosis gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_consultations_reason_trgm
  ON consultations USING gin (reason_for_visit gin_trgm_ops);

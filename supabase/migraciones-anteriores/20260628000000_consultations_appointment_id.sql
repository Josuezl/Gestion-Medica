-- Vincula cada consulta con la cita de la que nació (si aplica).
-- Hasta ahora `createConsultation` recibía el appointmentId pero NO lo guardaba, así que no había
-- forma confiable de saber si una cita tenía una consulta registrada. Este vínculo habilita:
--   1) la validación que impide marcar una cita como "Realizada" (COMPLETED) sin consulta, y
--   2) una auditoría de consultas que registre a qué cita pertenecen.
-- ON DELETE SET NULL: si se borra la cita, la consulta clínica se conserva (es la fuente de verdad).
-- No se hace backfill de consultas/citas históricas: el vínculo es hacia adelante.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consultations_appointment_id ON consultations(appointment_id);

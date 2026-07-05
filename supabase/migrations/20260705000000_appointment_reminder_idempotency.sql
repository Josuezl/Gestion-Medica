-- P0-2 (revision_tecnica_2026-07-05.md): el cron de recordatorios pasa de 1 corrida diaria a
-- 1 por hora. Para que las ventanas horarias puedan solaparse sin enviar recordatorios
-- duplicados, cada tipo de recordatorio se marca como enviado en la propia cita.
-- El cron filtra por `is null`, así que cada cita recibe cada recordatorio a lo sumo una vez.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at timestamptz;

-- Índice parcial para la consulta caliente del cron: citas confirmadas próximas sin recordatorio.
-- (El cron corre con service_role, sin RLS; el índice cubre el filtro por rango + estado.)
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_24h_pending
  ON appointments (scheduled_at)
  WHERE status = 'CONFIRMED' AND reminder_24h_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_reminder_2h_pending
  ON appointments (scheduled_at)
  WHERE status = 'CONFIRMED' AND reminder_2h_sent_at IS NULL;

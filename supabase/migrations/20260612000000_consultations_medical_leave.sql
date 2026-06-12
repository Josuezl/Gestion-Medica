-- Incapacidad médica emitida en la consulta (texto: días y motivo).
-- Se usa para el documento imprimible "Incapacidad Médica".
alter table public.consultations
  add column if not exists medical_leave text;

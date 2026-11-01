-- Incapacidad y referencia con campos propios (aditivo: se corre en Supabase ANTES del push).
-- Las indicaciones siguen en medical_leave y el motivo de referencia en referral; estas columnas
-- agregan inicio, días, diagnóstico propio de la constancia, fecha de emisión y destinatario.
-- Los registros existentes quedan con NULL y se imprimen como siempre (solo el texto).
alter table public.consultations
  add column if not exists leave_start_date date,
  add column if not exists leave_days integer
    check (leave_days between 1 and 365),
  add column if not exists leave_diagnosis text,
  add column if not exists leave_issued_at timestamptz,
  add column if not exists referral_to text;

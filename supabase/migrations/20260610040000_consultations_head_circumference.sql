-- Perímetro cefálico en la consulta (para el seguimiento pediátrico y las curvas OMS).
alter table public.consultations
  add column if not exists head_circumference numeric;

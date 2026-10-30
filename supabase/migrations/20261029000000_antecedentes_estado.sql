-- Estado de cada antecedente: Sin registrar / Niega / Refiere (aditivo: se corre en Supabase ANTES
-- del push). NULL = todavía no confirmado con la interfaz nueva: la app lo deduce del texto existente
-- (utils/antecedentes.ts) y lo guarda explícito la próxima vez que el médico guarda. No se reescribe
-- ningún registro existente.
alter table public.patients
  add column if not exists allergies_status text
    check (allergies_status in ('sin_registrar', 'niega', 'refiere')),
  add column if not exists pathological_history_status text
    check (pathological_history_status in ('sin_registrar', 'niega', 'refiere')),
  add column if not exists non_pathological_history_status text
    check (non_pathological_history_status in ('sin_registrar', 'niega', 'refiere')),
  add column if not exists family_history_status text
    check (family_history_status in ('sin_registrar', 'niega', 'refiere'));

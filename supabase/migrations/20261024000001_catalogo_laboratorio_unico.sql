-- Índices únicos del catálogo de laboratorio (aditivo: se corre en Supabase ANTES del push).
-- Igual que study_sections / study_catalog: permiten que ensureLabCatalogSeeded siembre el catálogo
-- por defecto sin duplicarlo si dos personas abren la pantalla a la vez.
--
-- ANTES de correrlo en producción, confirmar que no hay duplicados (ambas consultas deben dar 0 filas):
--   select clinic_id, name, count(*) from public.lab_test_categories group by 1, 2 having count(*) > 1;
--   select category_id, name, count(*) from public.lab_tests group by 1, 2 having count(*) > 1;
create unique index if not exists uq_lab_test_categories_clinic_name
  on public.lab_test_categories (clinic_id, name);

create unique index if not exists uq_lab_tests_category_name
  on public.lab_tests (category_id, name);

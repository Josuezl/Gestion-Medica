-- Quita duplicados del catálogo de estudios y añade índices únicos para impedir que se repitan.
-- Causa: la siembra automática del catálogo podía ejecutarse en paralelo (varias cargas de página a la
-- vez, incl. el prefetch de Next.js) y el guard `count == 0` no es atómico, por lo que se creaba la
-- misma sección más de una vez. Estos índices únicos hacen la siembra a prueba de carreras y permiten
-- usar upsert con ignoreDuplicates.

-- 1. Borrar secciones duplicadas por (clinic_id, name), conservando la más antigua.
--    Los estudios de las secciones borradas se eliminan en cascada (FK on delete cascade).
delete from study_sections
where id in (
  select id from (
    select id, row_number() over (partition by clinic_id, name order by created_at, id) as rn
    from study_sections
  ) t where t.rn > 1
);

-- 2. Borrar estudios duplicados por (section_id, name), conservando el más antiguo.
delete from study_catalog
where id in (
  select id from (
    select id, row_number() over (partition by section_id, name order by created_at, id) as rn
    from study_catalog
  ) t where t.rn > 1
);

-- 3. Índices únicos que impiden duplicados a futuro.
create unique index if not exists uq_study_sections_clinic_name on study_sections(clinic_id, name);
create unique index if not exists uq_study_catalog_section_name on study_catalog(section_id, name);

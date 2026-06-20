-- Higiene de drift repo↔BD: la app ya inserta consultations.height (NewConsultationClient + createConsultation)
-- pero la columna solo existía en la BD real, no en una migración versionada. Se versiona aquí.
-- IF NOT EXISTS la hace idempotente (no falla si ya está aplicada en producción).
alter table consultations add column if not exists height numeric(5,2);  -- cm (talla)

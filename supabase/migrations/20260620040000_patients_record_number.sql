-- Número de expediente (opcional, alfanumérico libre): algunas clínicas lo manejan como
-- identificador propio. Sin restricción de unicidad por ahora (decisión de producto).
alter table patients add column if not exists record_number varchar(50);

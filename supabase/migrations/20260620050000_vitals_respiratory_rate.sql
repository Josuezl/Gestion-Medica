-- Nuevo signo vital: Frecuencia respiratoria (respiraciones por minuto; referencia normal 12-20).
-- Se agrega tanto a las consultas como a la pre-clínica de enfermería.
alter table consultations add column if not exists respiratory_rate integer;
alter table preclinical_vitals add column if not exists respiratory_rate integer;

-- Nuevo rol NURSE (Auxiliar de Enfermería) en user_profiles.
-- Toma signos vitales (pre-clínica) y ve la agenda; no hace ni ve trabajo clínico (igual de
-- restringida que ASSISTANT en lo clínico). Se amplía el CHECK del rol para permitirlo.
--
-- El CHECK original es inline en schema.sql, por lo que Postgres lo nombró user_profiles_role_check.
alter table user_profiles drop constraint if exists user_profiles_role_check;
alter table user_profiles
  add constraint user_profiles_role_check
  check (role in ('ADMIN', 'DOCTOR', 'ASSISTANT', 'NURSE'));

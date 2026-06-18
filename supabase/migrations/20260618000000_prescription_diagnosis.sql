-- Diagnóstico opcional impreso en la receta. Algunas aseguradoras lo exigen.
-- Se guarda como SNAPSHOT en la receta (no se hace join a la consulta) y solo cuando el médico
-- marca "Incluir diagnóstico" al crear la consulta. NULL = no se incluye / receta vieja.
alter table prescriptions add column if not exists diagnosis text;

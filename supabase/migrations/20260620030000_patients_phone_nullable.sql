-- Teléfono opcional al registrar paciente: la columna deja de ser NOT NULL.
-- (Recepción puede guardar sin teléfono y agregarlo después.)
alter table patients alter column phone drop not null;

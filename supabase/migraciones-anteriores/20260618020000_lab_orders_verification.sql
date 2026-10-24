-- Código de verificación para las órdenes de laboratorio (QR público, igual que recetas).
alter table lab_orders add column if not exists verification_code varchar(100);

-- Backfill: darles código a las órdenes que ya existen para que su QR funcione.
update lab_orders
  set verification_code = 'LAB-' || upper(substr(md5(random()::text || id::text), 1, 9))
  where verification_code is null;

create unique index if not exists idx_lab_orders_verification_code
  on lab_orders(verification_code);

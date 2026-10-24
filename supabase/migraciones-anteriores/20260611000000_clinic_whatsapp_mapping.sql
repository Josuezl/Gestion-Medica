-- Mapeo clínica ↔ número de WhatsApp (phone_number_id de Meta), para rutear los
-- mensajes entrantes a la clínica correcta en vez de usar "la primera clínica".
alter table public.clinics
  add column if not exists whatsapp_phone_number_id text;

-- Un phone_number_id solo puede pertenecer a una clínica.
create unique index if not exists clinics_whatsapp_phone_number_id_key
  on public.clinics (whatsapp_phone_number_id)
  where whatsapp_phone_number_id is not null;

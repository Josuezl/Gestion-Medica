-- Asegura que el plan HOSPITAL existe; no falla si ya estaba.
insert into public.plans (code, name, is_active, max_doctors, max_assistants, max_locations, max_storage_mb)
values ('HOSPITAL', 'Hospital', true, 20, 20, 10, 51200)
on conflict (code) do nothing;

-- FK de user_profiles.id -> auth.users(id) con ON DELETE CASCADE.
-- Hoy no existe esa FK, por lo que borrar un usuario de Auth deja el perfil huérfano.
-- Con la cascada, borrar el usuario limpia automáticamente su user_profiles.

-- 1. Limpiar perfiles huérfanos existentes (sin usuario de Auth) para que la FK pueda crearse.
delete from public.user_profiles
  where id not in (select id from auth.users);

-- 2. Crear la FK (idempotente).
alter table public.user_profiles
  drop constraint if exists user_profiles_id_fkey;
alter table public.user_profiles
  add constraint user_profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

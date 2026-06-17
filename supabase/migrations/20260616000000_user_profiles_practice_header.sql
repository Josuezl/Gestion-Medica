-- Encabezado de receta por-doctor: cada médico puede tener su propio nombre de consultorio,
-- teléfono y dirección para SUS recetas. Si quedan NULL, la receta usa los de la organización.
alter table public.user_profiles add column if not exists practice_name    text;
alter table public.user_profiles add column if not exists practice_phone   text;
alter table public.user_profiles add column if not exists practice_address text;

comment on column public.user_profiles.practice_name    is 'Nombre del consultorio del médico para el encabezado de la receta. NULL = usar el de la organización.';
comment on column public.user_profiles.practice_phone   is 'Teléfono para el encabezado de la receta. NULL = usar el de la organización.';
comment on column public.user_profiles.practice_address is 'Dirección para el encabezado de la receta. NULL = usar el de la organización.';

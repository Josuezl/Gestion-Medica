-- =====================================================================
-- HORARIOS DE AGENDA PÚBLICA EDITABLES POR TODO EL EQUIPO
--
-- La sección "Agenda en línea" (enlaces públicos + horarios por médico)
-- la gestiona todo el personal de la clínica: asistentes, médicos y
-- enfermería — igual que las citas y los enlaces públicos. Se relaja la
-- política de escritura de doctor_schedules (antes solo org-admin).
-- =====================================================================

drop policy if exists doctor_schedules_write on public.doctor_schedules;
create policy doctor_schedules_write on public.doctor_schedules for all to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

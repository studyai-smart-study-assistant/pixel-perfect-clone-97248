GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_profiles TO authenticated;
CREATE POLICY "Paired family members can view profiles" ON public.family_profiles FOR SELECT TO authenticated USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.family_devices d
    WHERE d.profile_id = family_profiles.id
      AND public.family_device_is_accessible(d.id)
  )
);
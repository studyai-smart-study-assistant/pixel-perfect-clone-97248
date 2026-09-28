CREATE OR REPLACE FUNCTION public.register_family_device(_profile_id uuid, _device_name text, _role text, _platform text DEFAULT 'android')
RETURNS TABLE (id uuid, device_uuid uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to register this device';
  END IF;
  IF _role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Choose a valid device role';
  END IF;
  IF _platform NOT IN ('android', 'web') THEN
    RAISE EXCEPTION 'Choose a valid device platform';
  END IF;
  IF char_length(trim(_device_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Device name must be between 1 and 100 characters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.family_profiles
    WHERE family_profiles.id = _profile_id
      AND family_profiles.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profile does not belong to the signed-in account';
  END IF;
  RETURN QUERY
    INSERT INTO public.family_devices (owner_id, profile_id, device_name, role, platform)
    VALUES (auth.uid(), _profile_id, trim(_device_name), _role, _platform)
    RETURNING family_devices.id, family_devices.device_uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.register_family_device(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_family_device(uuid, text, text, text) TO authenticated, service_role;
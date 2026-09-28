CREATE TABLE public.family_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_profiles TO authenticated;
GRANT ALL ON public.family_profiles TO service_role;
ALTER TABLE public.family_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are managed by their owner" ON public.family_profiles FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.family_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  profile_id UUID REFERENCES public.family_profiles(id) ON DELETE SET NULL,
  device_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  device_name TEXT NOT NULL CHECK (char_length(device_name) BETWEEN 1 AND 100),
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  platform TEXT NOT NULL DEFAULT 'web',
  microphone_enabled BOOLEAN NOT NULL DEFAULT false,
  camera_enabled BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_devices TO authenticated;
GRANT ALL ON public.family_devices TO service_role;
ALTER TABLE public.family_devices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.family_device_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_device_id UUID NOT NULL REFERENCES public.family_devices(id) ON DELETE CASCADE,
  user_device_id UUID NOT NULL REFERENCES public.family_devices(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT family_device_pairs_distinct_devices CHECK (admin_device_id <> user_device_id),
  CONSTRAINT family_device_pairs_unique UNIQUE (admin_device_id, user_device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_device_pairs TO authenticated;
GRANT ALL ON public.family_device_pairs TO service_role;
ALTER TABLE public.family_device_pairs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.family_pairing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_device_id UUID NOT NULL REFERENCES public.family_devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_pairing_sessions TO authenticated;
GRANT ALL ON public.family_pairing_sessions TO service_role;
ALTER TABLE public.family_pairing_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.family_device_is_owned(_device_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.family_devices WHERE id = _device_id AND owner_id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.family_device_is_owned(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.family_device_is_accessible(_device_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_devices WHERE id = _device_id AND owner_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.family_device_pairs p
    JOIN public.family_devices a ON a.id = p.admin_device_id
    JOIN public.family_devices u ON u.id = p.user_device_id
    WHERE p.active AND (a.owner_id = auth.uid() OR u.owner_id = auth.uid())
      AND (_device_id = a.id OR _device_id = u.id)
  )
$$;
GRANT EXECUTE ON FUNCTION public.family_device_is_accessible(UUID) TO authenticated;

CREATE POLICY "Owners and paired family members can view devices" ON public.family_devices FOR SELECT TO authenticated USING (public.family_device_is_accessible(id));
CREATE POLICY "Owners can register devices" ON public.family_devices FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update devices" ON public.family_devices FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can remove devices" ON public.family_devices FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Pairings are visible to their device owners" ON public.family_device_pairs FOR SELECT TO authenticated USING (public.family_device_is_accessible(admin_device_id) AND public.family_device_is_accessible(user_device_id));
CREATE POLICY "Owners can revoke their own device pairings" ON public.family_device_pairs FOR DELETE TO authenticated USING (public.family_device_is_owned(admin_device_id));
CREATE POLICY "Pairing sessions belong to their user device owner" ON public.family_pairing_sessions FOR SELECT TO authenticated USING (public.family_device_is_owned(user_device_id));
CREATE POLICY "Owners create pairing sessions for user devices" ON public.family_pairing_sessions FOR INSERT TO authenticated WITH CHECK (public.family_device_is_owned(user_device_id));
CREATE POLICY "Owners refresh pairing sessions for user devices" ON public.family_pairing_sessions FOR UPDATE TO authenticated USING (public.family_device_is_owned(user_device_id)) WITH CHECK (public.family_device_is_owned(user_device_id));

CREATE OR REPLACE FUNCTION public.create_family_pairing_session(_user_device_id UUID, _token_hash TEXT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _expires_at TIMESTAMPTZ := now() + interval '5 minutes';
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.family_devices WHERE id = _user_device_id AND owner_id = auth.uid() AND role = 'user') THEN
    RAISE EXCEPTION 'Not authorized to create a pairing code for this device';
  END IF;
  IF char_length(_token_hash) <> 64 THEN RAISE EXCEPTION 'Invalid pairing token'; END IF;
  UPDATE public.family_pairing_sessions SET consumed_at = now() WHERE user_device_id = _user_device_id AND consumed_at IS NULL;
  INSERT INTO public.family_pairing_sessions (user_device_id, token_hash, expires_at) VALUES (_user_device_id, _token_hash, _expires_at);
  RETURN _expires_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_family_pairing_session(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_family_pairing_session(_admin_device_id UUID, _token_hash TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _user_device_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.family_devices WHERE id = _admin_device_id AND owner_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized to pair devices from this installation';
  END IF;
  SELECT user_device_id INTO _user_device_id FROM public.family_pairing_sessions
    WHERE token_hash = _token_hash AND consumed_at IS NULL AND expires_at > now() FOR UPDATE;
  IF _user_device_id IS NULL THEN RAISE EXCEPTION 'Pairing code is invalid or expired'; END IF;
  IF EXISTS (SELECT 1 FROM public.family_device_pairs WHERE admin_device_id = _admin_device_id AND user_device_id = _user_device_id AND active) THEN
    RAISE EXCEPTION 'These devices are already paired';
  END IF;
  UPDATE public.family_pairing_sessions SET consumed_at = now() WHERE token_hash = _token_hash;
  INSERT INTO public.family_device_pairs (admin_device_id, user_device_id) VALUES (_admin_device_id, _user_device_id);
  RETURN _user_device_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_family_pairing_session(UUID, TEXT) TO authenticated;
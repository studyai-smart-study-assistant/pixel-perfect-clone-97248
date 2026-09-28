import { supabase } from '@/integrations/supabase/client';

export type DeviceRole = 'admin' | 'user';
export type Installation = { id: string; role: DeviceRole; deviceName: string; profileName: string };
export type FamilyDevice = {
  id: string;
  device_uuid: string;
  device_name: string;
  role: DeviceRole;
  platform: string;
  microphone_enabled: boolean;
  camera_enabled: boolean;
  last_seen_at: string;
  profile_id: string | null;
  label: string;
};

const installationKey = 'family-care-installation-v1';

export function getInstallation(): Installation | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(installationKey);
    return saved ? (JSON.parse(saved) as Installation) : null;
  } catch {
    return null;
  }
}

export async function saveSetup(role: DeviceRole, deviceName: string, profileName: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to set up this device.');

  const { data: profile, error: profileError } = await supabase
    .from('family_profiles')
    .insert({ display_name: profileName.trim() })
    .select('id')
    .single();
  if (profileError) throw profileError;

  const { data: device, error: deviceError } = await supabase
    .from('family_devices')
    .insert({ device_name: deviceName.trim(), role, profile_id: profile.id, platform: 'android' })
    .select('id, device_uuid')
    .single();
  if (deviceError) {
    await supabase.from('family_profiles').delete().eq('id', profile.id);
    throw deviceError;
  }

  const installation = { id: device.id, role, deviceName: deviceName.trim(), profileName: profileName.trim() };
  window.localStorage.setItem(installationKey, JSON.stringify(installation));
  return { ...installation, deviceUuid: device.device_uuid };
}

export async function loadFamilyDevices(adminDeviceId: string): Promise<FamilyDevice[]> {
  const { data: pairs, error: pairError } = await supabase
    .from('family_device_pairs')
    .select('user_device_id')
    .eq('admin_device_id', adminDeviceId)
    .eq('active', true);
  if (pairError) throw pairError;
  const ids = (pairs ?? []).map((pair) => pair.user_device_id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('family_devices')
    .select('id, device_uuid, device_name, role, platform, microphone_enabled, camera_enabled, last_seen_at, profile_id, family_profiles(display_name)')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    label: row.family_profiles?.display_name ?? row.device_name,
  }));
}

export async function createPairingCode(deviceId: string) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const { data: expiresAt, error } = await supabase.rpc('create_family_pairing_session', {
    _user_device_id: deviceId,
    _token_hash: tokenHash,
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function pairDevice(adminDeviceId: string, token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const { data: userDeviceId, error } = await supabase.rpc('consume_family_pairing_session', {
    _admin_device_id: adminDeviceId,
    _token_hash: tokenHash,
  });
  if (error) throw error;
  return userDeviceId;
}

export async function setCapability(deviceId: string, capability: 'microphone_enabled' | 'camera_enabled', enabled: boolean) {
  const { error } = await supabase.from('family_devices').update({ [capability]: enabled }).eq('id', deviceId);
  if (error) throw error;
}

export async function removePairing(adminDeviceId: string, userDeviceId: string) {
  const { error } = await supabase.from('family_device_pairs').delete()
    .eq('admin_device_id', adminDeviceId).eq('user_device_id', userDeviceId);
  if (error) throw error;
}

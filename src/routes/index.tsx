import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Heart, KeyRound, LogOut, Mic, MonitorSmartphone, Plus, QrCode, Radio, RefreshCw, ScanLine, ShieldCheck, Smartphone, UserRound, Video, Wifi, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { createPairingCode, getInstallation, loadFamilyDevices, pairDevice, removePairing, saveSetup, setCapability, type DeviceRole, type FamilyDevice, type Installation } from '@/lib/family-care';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Family Care — Stay close, with care' },
      { name: 'description', content: 'A private family-care companion for trusted devices and people.' },
      { property: 'og:title', content: 'Family Care — Stay close, with care' },
      { property: 'og:description', content: 'A private family-care companion for trusted devices and people.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: FamilyCareApp,
});

type PairCode = { token: string; expiresAt: string };

function FamilyCareApp() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [role, setRole] = useState<DeviceRole | null>(null);
  const [deviceName, setDeviceName] = useState('My phone');
  const [profileName, setProfileName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devices, setDevices] = useState<FamilyDevice[]>([]);
  const [pairCode, setPairCode] = useState<PairCode | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [manualToken, setManualToken] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<FamilyDevice | null>(null);

  const refreshDevices = useCallback(async (current: Installation | null) => {
    if (current?.role !== 'admin') return;
    try {
      setDevices(await loadFamilyDevices(current.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load paired devices.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      const [{ data }, saved] = await Promise.all([supabase.auth.getUser(), Promise.resolve(getInstallation())]);
      if (!active) return;
      if (data.user) {
        setUserEmail(data.user.email ?? 'Signed in');
        setInstallation(saved);
      }
    };
    void initialize();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
      setUserEmail(session?.user.email ?? null);
      if (event === 'SIGNED_OUT') {
        setInstallation(null);
        setPairCode(null);
        window.localStorage.removeItem('family-care-installation-v1');
      } else if (session) setInstallation(getInstallation());
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => { void refreshDevices(installation); }, [installation, refreshDevices]);
  useEffect(() => {
    if (!pairCode) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((new Date(pairCode.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setPairCode(null);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pairCode]);
  useEffect(() => {
    if (!installation || installation.role !== 'admin') return;
    const timer = window.setInterval(() => void refreshDevices(installation), 5000);
    return () => window.clearInterval(timer);
  }, [installation, refreshDevices]);

  const expiryLabel = useMemo(() => `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`, [remaining]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (authMode === 'sign-up') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        if (!data.session) { setNotice('Check your email to confirm your account, then sign in.'); setAuthMode('sign-in'); }
        else { setUserEmail(data.user?.email ?? email); setInstallation(getInstallation()); }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setUserEmail(data.user.email ?? email); setInstallation(getInstallation());
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function googleSignIn() {
    setBusy(true); setError('');
    try {
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
      setInstallation(getInstallation());
    } catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function finishSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!role) return;
    setBusy(true); setError('');
    try {
      const result = await saveSetup(role, deviceName, profileName);
      setInstallation({ id: result.id, role: result.role, deviceName: result.deviceName, profileName: result.profileName });
      setRole(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Setup failed.'); }
    finally { setBusy(false); }
  }

  async function newPairCode() {
    if (!installation) return;
    setBusy(true); setError('');
    try { setPairCode(await createPairingCode(installation.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a pairing code.'); }
    finally { setBusy(false); }
  }

  async function pairFromToken(raw: string) {
    if (!installation) return;
    const token = raw.trim().replace(/^familycare:/i, '');
    if (!/^[a-f\d]{64}$/i.test(token)) { setError('That QR code is not a valid Family Care pairing code.'); return; }
    setBusy(true); setError('');
    try {
      await pairDevice(installation.id, token);
      setManualToken(''); setScannerOpen(false); setNotice('Device paired securely.');
      await refreshDevices(installation);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not pair this device.'); }
    finally { setBusy(false); }
  }

  async function scanQr() {
    setError('');
    if (!Capacitor.isNativePlatform()) { setScannerOpen(true); return; }
    try {
      const result = await BarcodeScanner.scan();
      const value = result.barcodes[0]?.rawValue;
      if (value) await pairFromToken(value);
      else setError('No QR code was found. Try again or enter the code manually.');
    } catch (e) { setScannerOpen(true); setError(e instanceof Error ? e.message : 'Scanner unavailable. Enter the QR value below.'); }
  }

  async function changeCapability(deviceId: string, capability: 'microphone_enabled' | 'camera_enabled', enabled: boolean) {
    setError('');
    try {
      await setCapability(deviceId, capability, enabled);
      setDevices((items) => items.map((device) => device.id === deviceId ? { ...device, [capability]: enabled } : device));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change this setting.'); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUserEmail(null); setInstallation(null); setDevices([]); setPairCode(null);
    window.localStorage.removeItem('family-care-installation-v1');
  }

  if (!userEmail) return <main className="family-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Heart size={18} fill="currentColor" /></span><span>family care</span></a><span className="topbar-note">PRIVATE BY DESIGN</span></header>
    <section className="welcome-screen">
      <div className="welcome-copy"><span className="eyebrow"><span className="status-dot" /> A LITTLE CLOSER, EVERY DAY</span><h1>Care that keeps<br />you <em>connected.</em></h1><p>A quiet, private space for the people you love. Sign in to continue to your family.</p>
        <div className="care-signals"><span><ShieldCheck size={17} /> Private family circle</span><span><Wifi size={17} /> Your devices, your choice</span></div>
      </div>
      <div className="auth-panel"><div className="panel-heading"><span className="panel-icon"><Heart size={18} /></span><div><h2>{authMode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2><p>{authMode === 'sign-in' ? 'Sign in to your family space.' : 'A private space for your family.'}</p></div></div>
        <form onSubmit={handleAuth} className="form-stack"><label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></label><Button className="form-submit" disabled={busy}>{busy ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}</Button></form>
        <div className="auth-divider"><span />OR<span /></div><Button variant="outline" className="google-button" disabled={busy} onClick={googleSignIn}><GoogleMark />Continue with Google</Button>
        <p className="auth-switch">{authMode === 'sign-in' ? 'New to Family Care?' : 'Already have an account?'} <button onClick={() => { setError(''); setNotice(''); setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in'); }}>{authMode === 'sign-in' ? 'Create an account' : 'Sign in'}</button></p>
      </div>
      {(error || notice) && <div className={`form-message ${error ? 'is-error' : ''}`}>{error || notice}</div>}
    </section><footer className="page-foot"><span>Made with care, for the ones who matter.</span><span>ENCRYPTED FAMILY CONNECTION</span></footer>
  </main>;

  if (!installation || role) return <main className="family-shell"><header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Heart size={18} fill="currentColor" /></span><span>family care</span></a><button className="topbar-action" onClick={signOut}><LogOut size={16} /> Sign out</button></header><section className="setup-screen">
    {!role ? <><span className="eyebrow"><span className="status-dot" /> YOUR FAMILY, YOUR WAY</span><h1>How will you use<br />this <em>device?</em></h1><p className="setup-intro">Choose a role for this phone. You can pair it with another device in your family.</p><div className="role-choices"><button onClick={() => { setRole('admin'); setProfileName(''); }} className="role-option"><span className="role-icon admin-icon"><MonitorSmartphone /></span><span><strong>Admin device</strong><small>Connect and manage family devices</small></span><span className="role-arrow">→</span></button><button onClick={() => { setRole('user'); setProfileName(''); }} className="role-option"><span className="role-icon user-icon"><UserRound /></span><span><strong>User device</strong><small>Share this device with family</small></span><span className="role-arrow">→</span></button></div>
    </> : <><button className="back-button" onClick={() => setRole(null)}>← Change device type</button><span className="eyebrow"><span className="status-dot" /> {role === 'admin' ? 'ADMIN DEVICE' : 'USER DEVICE'}</span><h1>Name this<br /><em>device.</em></h1><p className="setup-intro">This name helps your family recognize it.</p><form className="setup-form" onSubmit={finishSetup}><label>Device name<input required maxLength={100} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} /></label><label>{role === 'admin' ? 'Your name' : 'Family member’s name'}<input required maxLength={80} value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={role === 'admin' ? 'e.g. Alex' : 'e.g. Grandma'} /></label><Button className="form-submit" disabled={busy}>{busy ? 'Saving…' : 'Continue'} <span>→</span></Button></form></>}
    {(error || notice) && <div className={`form-message ${error ? 'is-error' : ''}`}>{error || notice}</div>}
  </section><footer className="page-foot"><span>Made with care, for the ones who matter.</span><span>ENCRYPTED FAMILY CONNECTION</span></footer></main>;

  const isUser = installation.role === 'user';
  return <main className="family-shell dashboard-shell"><header className="topbar"><a className="brand" href="#"><span className="brand-mark"><Heart size={18} fill="currentColor" /></span><span>family care</span></a><div className="topbar-user"><span className={`role-pill ${installation.role}`}><span />{installation.role === 'admin' ? 'ADMIN' : 'USER'} DEVICE</span><button className="avatar-button" title={userEmail}>{(installation.profileName[0] ?? 'F').toUpperCase()}</button><button className="icon-action" title="Sign out" onClick={signOut}><LogOut size={17} /></button></div></header>
    <div className="dashboard-content"><div className="dash-greeting"><div><span className="eyebrow"><span className="status-dot" /> YOUR PRIVATE FAMILY CIRCLE</span><h1>{isUser ? <>Hello, <em>{installation.profileName}.</em></> : <>Good to have you,<br /><em>{installation.profileName}.</em></>}</h1><p>{isUser ? 'Your device is ready to stay connected with your family.' : 'Your family, together in one quiet place.'}</p></div><span className="greeting-heart"><Heart size={27} /></span></div>
      {error && <div className="form-message is-error">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}{notice && <div className="form-message">{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
      {isUser ? <section className="user-home"><div className="section-head"><div><span className="eyebrow">DEVICE PAIRING</span><h2>Stay in their circle.</h2></div><span className="section-symbol"><QrCode size={20} /></span></div><p className="section-copy">Show your private QR code to an Admin device you trust. It expires after five minutes and works once.</p>
        {pairCode && remaining > 0 ? <div className="qr-code-frame"><QRCodeSVG value={pairCode.token} size={210} level="M" bgColor="transparent" fgColor="currentColor" /><div className="qr-expiry"><span className="status-dot" /> Expires in <strong>{expiryLabel}</strong></div></div> : <div className="qr-placeholder"><div className="qr-placeholder-inner"><QrCode size={44} strokeWidth={1.3} /></div><span>Your code stays private until you create it</span></div>}
        <Button className="primary-action" disabled={busy} onClick={newPairCode}>{pairCode ? <RefreshCw size={17} /> : <QrCode size={17} />}{busy ? 'Creating code…' : pairCode ? 'Create a new code' : 'Create pairing code'}</Button><div className="privacy-line"><ShieldCheck size={15} /> A new code replaces any previous one</div>
        <section className="device-settings"><div className="section-head small"><div><span className="eyebrow">DEVICE SETTINGS</span><h2>Your sharing preferences</h2></div></div><CapabilityToggle icon={<Mic size={17} />} title="Microphone" description="Allow your family to hear you" enabled={devices[0]?.microphone_enabled ?? false} onChange={(value) => void changeCapability(installation.id, 'microphone_enabled', value)} /><CapabilityToggle icon={<Camera size={17} />} title="Camera" description="Allow your family to see you" enabled={devices[0]?.camera_enabled ?? false} onChange={(value) => void changeCapability(installation.id, 'camera_enabled', value)} /><p className="media-note">These controls record your sharing preference. Live audio and video calling are not available yet.</p></section>
      </section> : <section className="admin-home"><div className="section-head"><div><span className="eyebrow">YOUR FAMILY</span><h2>Connected devices <span className="count-badge">{devices.length}</span></h2></div><Button variant="outline" className="scan-button" onClick={scanQr}><ScanLine size={16} /> Pair device</Button></div><p className="section-copy">Only devices paired with this phone appear here.</p>
        {devices.length ? <div className="device-list">{devices.map((device) => <article className="device-row" key={device.id}><span className="device-avatar"><UserRound size={20} /></span><div className="device-main"><strong>{device.label}</strong><span><span className="status-dot" /> {device.device_name} · {device.platform === 'android' ? 'Android' : device.platform}</span></div><div className="device-capabilities">{device.microphone_enabled && <Mic size={15} title="Microphone sharing enabled" />}{device.camera_enabled && <Camera size={15} title="Camera sharing enabled" />}</div><Button variant="ghost" size="sm" className="details-button" onClick={() => setSelectedDevice(device)}>Details <span>→</span></Button></article>)}</div> : <div className="empty-devices"><div className="empty-icon"><Smartphone size={26} /></div><strong>Your family circle starts here.</strong><p>Pair a User device by scanning its temporary QR code.</p><Button className="primary-action" onClick={scanQr}><ScanLine size={16} /> Scan a pairing code</Button></div>}
      </section>}
      <section className="coming-soon"><div className="coming-icon"><Radio size={18} /></div><div><strong>Messages & live connection</strong><span>Voice messages and live camera are not available yet.</span></div><span className="coming-tag">COMING LATER</span></section>
    </div><footer className="page-foot"><span>Made with care, for the ones who matter.</span><span>ENCRYPTED FAMILY CONNECTION</span></footer>
    {scannerOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScannerOpen(false); }}><section className="pair-modal" role="dialog" aria-modal="true" aria-labelledby="pair-modal-title"><button className="modal-close" onClick={() => setScannerOpen(false)} aria-label="Close"><X size={18} /></button><span className="eyebrow">SECURE PAIRING</span><h2 id="pair-modal-title">Scan a family code.</h2><p>On an Android phone, open the camera scanner. Or enter the code value from the QR image.</p><div className="scan-frame"><ScanLine size={42} /><span>Point at a User device QR code</span></div><Button className="primary-action" disabled={busy} onClick={scanQr}><ScanLine size={17} /> Open camera scanner</Button><div className="auth-divider"><span />OR ENTER CODE<span /></div><form className="manual-pair-form" onSubmit={(event) => { event.preventDefault(); void pairFromToken(manualToken); }}><input aria-label="Pairing code" value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="Paste the 64-character code" /><Button disabled={busy || !manualToken.trim()}>Pair</Button></form></section></div>}
    {selectedDevice && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDevice(null); }}><section className="pair-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="device-details-title"><button className="modal-close" onClick={() => setSelectedDevice(null)} aria-label="Close"><X size={18} /></button><span className="eyebrow">FAMILY DEVICE</span><h2 id="device-details-title">{selectedDevice.label}</h2><p>{selectedDevice.device_name} · {selectedDevice.platform}</p><div className="detail-settings"><CapabilityToggle icon={<Mic size={17} />} title="Microphone" description="Sharing enabled" enabled={selectedDevice.microphone_enabled} onChange={(value) => { void changeCapability(selectedDevice.id, 'microphone_enabled', value); setSelectedDevice({ ...selectedDevice, microphone_enabled: value }); }} /><CapabilityToggle icon={<Video size={17} />} title="Camera" description="Sharing enabled" enabled={selectedDevice.camera_enabled} onChange={(value) => { void changeCapability(selectedDevice.id, 'camera_enabled', value); setSelectedDevice({ ...selectedDevice, camera_enabled: value }); }} /></div><Button variant="outline" className="remove-pair" onClick={async () => { try { await removePairing(installation.id, selectedDevice.id); setSelectedDevice(null); await refreshDevices(installation); setNotice('Device removed from your family circle.'); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove device.'); } }}>Remove this device</Button><p className="media-note">Changing a preference does not start a call. Live camera and audio are not available yet.</p></section></div>}
  </main>;
}

function CapabilityToggle({ icon, title, description, enabled, onChange }: { icon: React.ReactNode; title: string; description: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <div className="capability-row"><span className="capability-icon">{icon}</span><span className="capability-text"><strong>{title}</strong><small>{description}</small></span><button type="button" className={`toggle ${enabled ? 'is-on' : ''}`} aria-label={`${title} sharing ${enabled ? 'on' : 'off'}`} aria-pressed={enabled} onClick={() => onChange(!enabled)}><span /></button></div>;
}

function GoogleMark() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="google-mark"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.05 5.05 0 0 1-2.2 3.31v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.16v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.16a11 11 0 0 0 0 9.88l3.69-2.84Z"/><path fill="#EA4335" d="M12 4.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 1.09 14.97 0 12 0a11 11 0 0 0-9.84 7.06l3.69 2.84C6.72 7.3 9.14 4.37 12 4.37Z"/></svg>; }

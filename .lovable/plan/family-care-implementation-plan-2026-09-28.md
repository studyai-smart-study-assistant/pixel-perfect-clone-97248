# Family Care — implementation plan

Build the requested single-app Family Care foundation in the existing TanStack/React project, with an explicit Admin/User choice stored per installation—not per account. Deliver a polished mobile-first app plus a real Capacitor Android source project and clean-checkout APK workflow. Do not imply native background recording, secure remote pairing, notifications, or live streaming works until its Android/backend dependencies are configured and tested.

## Product work
- Replace the starter page with a usable Family Care experience: first-run device choice; User pairing QR with short expiry and refresh; Admin scan/add-device flow; device list and detail; voice-message actions; camera request; audio-send flow; and simple User microphone/camera controls. Keep all device roles installation-specific and support multiple paired Users per Admin.
- Use distinct, explicit setup and action states. In the web preview, represent device/media data as preview-only sample state, clearly separate from real pairing or monitoring. Never claim permissions, recording, QR validation, or streaming succeeded without native/backend support.
- Establish the semantic visual system and route-specific metadata for the first screen.

## Android and delivery
- Add Capacitor configuration and a committed Android project with native permission declarations and a clearly scoped Capacitor plugin/service boundary for Android-only AudioRecord, foreground microphone service, camera, and lifecycle work. Keep long-running capture out of WebView JavaScript; avoid a fake native implementation.
- Add a GitHub Actions workflow that installs from a clean checkout, builds the web app, syncs Capacitor, builds and verifies a debug APK with the Gradle wrapper, and uploads the APK artifact.
- Keep provider credentials out of source; document required Firebase/FCM and TURN configuration and which later capabilities remain unconfigured.

## Secure services and validation
- Enable Lovable Cloud before implementing real accounts, durable profiles/devices, one-time pairing, recordings/storage, authorization, audit events, presence, or signaling. Keep account identity, profile, installation, selected device role, and pairing as separate concepts; roles never live on profile/user records.
- Treat background VAD/audio capture, remote audio delivery, cleanup, and WebRTC camera as staged native/backend capabilities, not as working features based on mock UI alone. Preserve the spec's consent, retention, authorization, and no-camera-storage rules.
- Validate the first-run and Admin/User preview flows, Android project/workflow structure, and app build; report any unconfigured provider/native runtime limits explicitly.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project decisions
- Family Care is one Capacitor Android app; a person explicitly chooses each device's Admin/User role, not an account role or signup order, to avoid a global first-admin privilege.
- Each account owns its profiles and registered devices; the database validates pairing codes and enforces access so browser-stored identity is never trusted as authorization.
- Device sharing preferences are not proof of capture permission; microphone/camera use must be user-visible, natively permissioned, and never claimed as working before native capture and server authorization exist.
- Android APK automation must build the committed Gradle project from a clean checkout and verify the artifact before upload, so no Android Studio installation is required.
- Export the TanStack Start app shell to `dist/client/index.html` during builds so Capacitor can package the same app for native Android; keep server behavior in the normal web deployment.

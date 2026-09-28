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
- Family Care is a single Capacitor Android app; device role is explicitly selected and belongs to the installation, while user accounts and profiles remain separate. This prevents global or signup-order role assignment.
- Sensitive family operations use Lovable Cloud row security and server-validated pairing RPCs; browser state is never the authorization source. This keeps pairing and device access checks server-side.
- Native Android camera/microphone functionality must use explicit Capacitor/native APIs and permissions; web preview behavior must not imply background capture is available. Long-running capture and privacy-sensitive media are platform-owned.
- Android APK CI builds from the committed Gradle wrapper/project and uploads a verified APK. A clean checkout must not rely on Android Studio.

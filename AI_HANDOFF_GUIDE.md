# NightVault — AI Handoff Guide

**Version context:** NightVault 1.4.4 — Bugfix & Render Stability Update  
**Repository:** Onmaynec/NightVault  
**Platform:** Electron + Node.js/Express + local JSON/SQLite-oriented server runtime  
**Primary language:** JavaScript  
**Main user goal:** secure private messenger for LAN/RadminVPN testing with an admin server application.

## 1. What NightVault is

NightVault is an Electron desktop messenger with a separate admin/server mode. The app contains:

- Client messenger UI: chats, contacts, groups, saved messages, files, voice messages, themes, profile, settings.
- Server/admin UI: server launcher, logs, console, database viewer, backups, tests, updates, sessions, Radmin/LAN helper.
- Security features: E2EE payloads, device identity, recovery hints, 2FA scaffolding, local PIN lock, privacy settings, rate-limit and upload checks.
- Release tooling: Windows installer scripts, GitHub Actions release workflow, static audits, e2e smoke scripts and visual/static checks.

The project is currently developed as a fast-moving prototype with compatibility layers appended over time. Be careful when replacing functions: many older functions are intentionally wrapped by later release layers.

## 2. Important source files

- `src/renderer.js` — main client renderer. Large compatibility-layer file. Most UI and client behavior still lives here.
- `src/renderer/actions.js` — inline action bridge. It converts old inline `onclick` strings into safe function calls.
- `src/style.css` — client styles and theme polish.
- `src/main.js` — Electron main process, windows, secure storage, update logic, admin/server startup.
- `src/preload.js` — secure bridge exposed as `window.nv` / `NVBridge`.
- `src/admin-renderer.js` — admin app renderer.
- `src/admin.css` — admin UI styles.
- `server/server.js` — Express server, auth, chats/messages/files/sessions/admin endpoints.
- `server/lib/*` and `server/services/*` — config, security, validation, migrations, sync, privacy, messages, media, readiness.
- `scripts/*` — verification/audit/release scripts.
- `tests/*` — Node test runner tests.

## 3. Current release behavior in 1.4.4

1.4.4 is mainly a bugfix release after testing 1.4.3. It fixes:

- microphone selection persistence;
- unsupported UI actions from optional chaining and inline expressions;
- microphone `OverconstrainedError` fallback;
- blur-lock button in security settings;
- Backup AES-GCM button in data settings;
- E2EE Recovery 2.2 buttons;
- profile banner preview/hydration;
- old `Приватность 1.0.9` text;
- contacts search full-app rerender flicker;
- reply preview not clearing after sending a reply;
- local E2EE recovery cache persistence;
- WAV/audio playback edge errors;
- custom chat wallpaper and glass blur.

## 4. Current known sensitive areas

### Renderer architecture

`src/renderer.js` is large and contains release layers from older versions. Prefer adding small safe wrappers instead of editing old logic blindly. If refactoring, move one area at a time and keep existing public function names.

### Inline actions

Many HTML fragments still use `onclick`. The bridge in `src/renderer/actions.js` supports a safe subset. Avoid inline expressions like:

```js
onclick="localStorage.x=...;toast('...'+(...))"
```

Prefer simple function calls:

```js
onclick="nv144ToggleBlurLock()"
```

### E2EE history

E2EE payloads depend on local device keys. If a user loses the original device key, old messages cannot be truly decrypted without recovery. The app contains local recovery caches for messages already decrypted on that device, but this is not a replacement for proper recovery bundle import/export.

### Files and attachments

A profile avatar/banner, group avatar, message file, voice file and forwarded attachment are not the same pipeline. Do not use one generic file rule for everything. Check server binding rules in `server/server.js` and client handling in `buildOutgoingMessagePayload`, `hydrateFile`, `decryptBlobForRef`, and forwarding wrappers.

### Rendering flicker

Avoid calling full `render()` for small UI updates. Prefer:

- `renderChatListOnly()` for chat list;
- `renderMessagesOnly()` for messages;
- `nv144RenderContactsFilterOnly()` for contact filter;
- `renderCenterOnly()` / `renderSideOnly()` where available.

## 5. How to verify changes

Run:

```bash
npm run verify
```

Important included checks:

- `npm run check`
- `npm run audit`
- `npm run release-audit`
- `npm run admin-audit`
- `npm run messenger-audit`
- `npm run perf-audit`
- `npm run security-pro-audit`
- `npm run architecture-audit`
- `npm run release:preflight`
- `npm run bugfix-144-audit`
- `npm run native-controls-audit`
- `npm run ui:runtime-check`
- `npm run e2e:tester`
- `npm test`

The container cannot fully open and visually test the Windows Electron app. Windows tester reports and screenshots are important.

## 6. How to build installer

On Windows:

```bat
cd "C:\Users\Мамлеев Роман\Downloads\NightVault-1.4.4-release-source"
build-installer.bat
```

Expected output:

- `dist\NightVault-Setup-1.4.4.exe`
- `dist\NightVault-Setup-1.4.4.exe.blockmap`
- `dist\NightVault-1.4.4-x64.exe`
- `dist\latest.yml`

## 7. How to publish release

```bat
cd "C:\Users\Мамлеев Роман\Downloads\NightVault-1.4.4-release-source"

git init
git branch -M main
git remote remove origin
git remote add origin https://github.com/Onmaynec/NightVault.git

git add -A
git commit -m "Release NightVault 1.4.4"
git push -u origin main --force

git tag -f v1.4.4
git push origin v1.4.4 --force
```

## 8. Recommended next work

- Continue moving renderer features into small modules.
- Replace more inline HTML actions with router-safe functions.
- Implement real E2EE recovery bundle import, not only local decrypted cache.
- Add real Playwright/Electron tests if environment allows.
- Build a server-side migration compatibility test using real sample backups.
- Replace large renderer string templates with smaller components over time.

## 9. Current user priorities

The owner values:

- real bug fixes, not fake changelog entries;
- visible UI polish;
- stable RadminVPN testing;
- quick Windows build/release instructions;
- honesty about what was actually tested.

When responding to the owner, include:

- release ZIP link;
- what was fixed;
- tests actually run;
- installer build command;
- GitHub upload block.

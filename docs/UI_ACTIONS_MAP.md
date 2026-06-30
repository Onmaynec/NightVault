# NightVault 1.4.7 UI Actions Map

Статусы:

- `router-ready` — действие должно вызываться через `data-action` / `data-admin-action`.
- `legacy-required` — старое имя функции оставлено для совместимости.
- `legacy-removable` — кандидат на удаление после real Electron теста.

| Action | Target | File | Status | Test |
|---|---|---|---|---|
| `settings.save` | `saveSettings()` | `src/client/ui-action-router-147.js` | router-ready | settings save smoke |
| `settings.server.save` | `saveServerConnection()` | `src/client/ui-action-router-147.js` | router-ready | server settings smoke |
| `settings.connection.check` | `checkServerConnection()` | `src/client/ui-action-router-147.js` | router-ready | connection smoke |
| `settings.section` | `S.settingsSection + safeRender` | `src/client/ui-action-router-147.js` | router-ready | settings navigation |
| `contacts.filter` | `nv144RenderContactsFilterOnly()` | `src/client/ui-action-router-147.js` | router-ready | contacts partial render |
| `profile.avatar.pick` | `changeAvatar()` | `src/client/ui-action-router-147.js` | router-ready | profile smoke |
| `profile.banner.pick` | `changeBanner()` | `src/client/ui-action-router-147.js` | router-ready | profile smoke |
| `profile.save` | `saveProfile()` | `src/client/ui-action-router-147.js` | router-ready | profile smoke |
| `e2ee.health.open` | `openE2eeTrust()` | `src/client/ui-action-router-147.js` | router-ready | E2EE health smoke |
| `e2ee.resync` | `resyncE2eeDevice()` | `src/client/ui-action-router-147.js` | router-ready | E2EE resync smoke |
| `voice.testMic` | `nv144TestMicrophone()` | `src/client/ui-action-router-147.js` | router-ready | fake mic smoke |
| `overlay.closeAll` | close ctx/emoji/modal | `src/client/ui-action-router-147.js` | router-ready | overlay smoke |
| `admin.logs.export` | `exportLogs()` | `src/admin-actions.js` | router-ready | admin logs smoke |
| `admin.debugPack` | `debugReport()` | `src/admin-actions.js` | router-ready | admin debug pack |

Новые действия добавляются только в router layer. `src/renderer/actions.js` остаётся legacy fallback и не должен расширяться без отдельного обоснования.

# NightVault 1.4.7 UI Actions Test Plan

## Цель

Проверить, что основные действия клиента и админки работают через UI Action Router, strict CSP не ломает интерфейс, а legacy inline handlers остаются только как fallback.

## Клиент

1. Запустить сервер и два клиента:

```bat
start-server-admin.bat
start-client-profile.bat test-account-1
start-client-profile.bat test-account-2
```

2. Проверить auth flow: register/login/logout/restart.
3. Проверить chats: открыть чат, отправить сообщение, reply, reaction, context menu.
4. Проверить contacts: search, request, accept, filter, favorite/note если доступно.
5. Проверить profile: avatar/banner buttons, save, privacy controls.
6. Проверить settings: sections, theme, density, microphone, save, server connection check.
7. Проверить E2EE: health/trust screen, resync, warning about local decrypted cache.
8. Проверить overlays: emoji panel, context menu, modal close, Esc.
9. Проверить voice fake/test microphone.
10. Снять debug pack, если любое действие не сработало.

## Админка

1. Запустить `start-server-admin.bat`.
2. Проверить login админа.
3. Проверить вкладки dashboard/logs/data/tests/Radmin.
4. Проверить logs search/export/clear.
5. Проверить debug report.
6. Проверить LAN/Radmin copy URL/QR refresh, если доступно.

## Команды

```bat
npm run ui-actions:audit
npm run ui-actions:report
npm run csp:audit
npm run no-render-in-input-audit
npm run legacy:audit
set NIGHTVAULT_FORCE_REAL_ELECTRON=1
npm run e2e:real
```

## Что приложить к багу

- Скриншот или видео.
- Last action из debug pack.
- CSP violation, если есть.
- `ui-actions-last.json` / action telemetry.
- Версия NightVault и Windows build.

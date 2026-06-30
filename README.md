# NightVault 1.4.7 — UI Action Router & CSP Hardening Update

Версия 1.4.7 закрывает главный технический долг интерфейса после 1.4.6: переносит новые действия на `data-action`/UI Action Router, вводит аудит legacy inline handlers, добавляет strict CSP diagnostics и усиливает partial-render safety без полного переписывания `renderer.js`.

## Быстрый запуск

```bat
npm install
npm run apply:147
npm run verify
npm run ui-actions:audit
npm run csp:audit
npm run reliability-147-audit
```

Для настоящей Windows/Electron проверки:

```bat
set NIGHTVAULT_FORCE_REAL_ELECTRON=1
npm run e2e:real
start-server-admin.bat
start-client-profile.bat test-account-1
start-client-profile.bat test-account-2
```

## Что изменилось

- Добавлен слой `src/client/ui-action-router-147.js` с telemetry, безопасным dispatch, overlay actions и `nvBindPartial`.
- Добавлен `src/renderer/strict-csp.js` с CSP violation listener, safe render helpers и debug state.
- Добавлен `src/admin-actions.js` для router-style действий админки.
- Добавлены аудиты: UI actions, CSP consistency, no-render-in-input, legacy compatibility, release reliability.
- Добавлены документы: карта UI actions, карта legacy compatibility, тест-план UI actions, guide заливки.
- `apply:147` обновляет package version/scripts, вставляет новые scripts в HTML, переводит CSP на `script-src-attr 'none'` и добавляет compatibility layer `nv147UiActionLayer`.

## Важное ограничение

`renderer.js` не переписывается целиком. 1.4.7 добавляет маленький compatibility layer и отдельные router/CSP файлы, чтобы не сломать существующие функции сообщений, файлов и E2EE.

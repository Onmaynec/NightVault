# NightVault 1.4.7 Changeset

## Added

- `src/client/ui-action-router-147.js` — новый data-action router layer.
- `src/renderer/strict-csp.js` — CSP diagnostics, safe render helpers, debug state.
- `src/admin-actions.js` — router-style actions для админки.
- `scripts/ui-actions-audit.js` и `scripts/ui-actions-report.js`.
- `scripts/csp-consistency-audit.js`.
- `scripts/no-render-in-input-audit.js`.
- `scripts/legacy-compatibility-audit.js`.
- `scripts/reliability-147-audit.js`.
- `docs/testing/UI_ACTIONS_TEST_PLAN_1.4.7.md`.

## Changed

- Patch script переводит `script-src-attr 'unsafe-inline'` в `script-src-attr 'none'`.
- Patch script вставляет strict CSP diagnostics и 1.4.7 router в `src/index.html`.
- Patch script добавляет `nv147UiActionLayer` в конец `renderer.js`, не переписывая файл целиком.
- `package.json` получает version `1.4.7` и новые audit scripts.

## Security

- CSP hardening для script attributes.
- CSP violation telemetry.
- Legacy inline actions are audited and documented.

## Known limitations

- `style-src 'unsafe-inline'` пока остаётся для тем/акцентов.
- `actions.js` остаётся legacy fallback.
- Полная миграция всех старых HTML fragments может потребовать дополнительного ручного прохода после `ui-actions:report`.

# NightVault 1.4.6 RELEASE

## Codename

Real Electron QA & UI Safety Update

## Goal

Перестать маскировать static checks под real E2E и подготовить NightVault к проверке настоящего Electron-окна, двух профилей на одном ПК, UI action safety и release QA.

## Added

- `scripts/e2e-real-smoke.js` — Electron/CDP smoke harness.
- `scripts/e2e-static-smoke.js` — честное имя для старых статических проверок.
- `scripts/e2e-two-profile-smoke.js` — two-profile QA checklist/smoke.
- `scripts/ui-actions-report.js` — отчёт legacy inline handlers.
- `scripts/duplicate-globals-audit.js` — поиск дублирующихся renderer globals.
- `scripts/version-consistency.js` — версия package/changelog/release docs.
- `scripts/release-assets-check.js` — expected dist assets.
- `scripts/prepare-release-source.js` — source archive без runtime/dist/uploads.
- `scripts/release-qa.js` — агрегатор release QA.
- `docs/UI_ACTIONS_MAP.md`, `docs/LEGACY_COMPATIBILITY_MAP.md`, `docs/GIT_UPLOAD_GUIDE_1.4.6.md`.

## Changed

- `verify` разделён на static/server/electron phases.
- Старый `e2e` теперь указывает на `e2e:static`; real Electron проверка находится отдельно.
- Release docs и changelog обновлены на 1.4.6.

## Safety

- `renderer.js` не переписывается. Патч только точечно обновляет release label и добавляет `nv146QaLayer` через apply script.
- Inline handlers не удаляются резко; добавлен report-first подход.
- E2EE recovery wording остаётся честным: local cache != recovery bundle.

## Known limitations

- Real Electron smoke должен запускаться на Windows/test VM или другой среде с Electron display. В headless Linux без display скрипт честно сообщает skip.
- Full E2EE recovery bundle не входит в 1.4.6.

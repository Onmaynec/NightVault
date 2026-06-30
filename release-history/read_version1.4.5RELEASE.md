# NightVault 1.4.5 RELEASE

Reliability & Fresh DB Fix.

## Главная цель

Закрыть инфраструктурные риски после 1.4.4 без большого переписывания `renderer.js`: свежая SQLite-база, миграции, upload limits, честные проверки, UI action audit, cleanup report и документация релиза.

## Added

- `npm run db-audit` — проверка версии, runtime paths, upload limits и fresh DB migration coverage.
- `npm run fresh-db-smoke` — чистый data dir, запуск сервера, register/register, contacts, private chat, E2EE devices, upload, message, readiness.
- `tests/fresh-db.test.js` — node:test wrapper для fresh-db smoke.
- `server/migrations/014_145_schema_alignment.sql` — richer schema для fresh SQLite DB до fallback `CREATE TABLE IF NOT EXISTS`.
- `npm run ui-actions-audit` — проверка legacy inline handlers на совместимость с Action Bridge.
- `npm run cleanup:report` — отчёт по лишним runtime/log/tmp/dist/cache/root release artifacts.
- `docs/GIT_UPLOAD_GUIDE_1.4.5.md`, `docs/TESTER_REPORT_TEMPLATE.md`, `docs/NIGHTVAULT_1.4.5_CHANGESET.md`.

## Fixed / Changed

- `package.json` обновлён до 1.4.5.
- `verify` разделён на `verify:static`, `verify:server`, `verify:electron`.
- Upload envelope limit по умолчанию поднят так, чтобы серверный `multer` не резал видео до server-side validation.
- `src/renderer/core.js` поднят до `1.0.10`; `maxAttachmentBytes` теперь 100 MB.
- `release-preflight` больше не захардкожен на 1.4.4.
- `bugfix-144-audit` теперь проверяет совместимость 1.4.x, а не только package version 1.4.4.
- `ui-runtime-check` честно обозначен как static runtime check.

## Security / E2EE

- Формулировка E2EE recovery уточнена: локальный decrypted cache помогает только для уже расшифрованных сообщений на этом устройстве.
- Полный recovery bundle не входит в 1.4.5 и не должен заменяться plaintext на сервере.

## Known limitations

- Это не полный Playwright/Electron e2e. Живое Windows/Electron окно нужно проверить вручную или будущим `verify:electron` на Windows.
- Миграция 014 гарантирует правильную fresh DB schema; старые повреждённые SQLite-файлы требуют отдельного backup/import dry-run.

## Проверка

```bat
npm install
npm run verify
npm run db-audit
npm run fresh-db-smoke
npm run cleanup:report
```

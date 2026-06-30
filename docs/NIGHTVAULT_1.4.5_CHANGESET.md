# NightVault 1.4.5 — список изменений по ТЗ

## Проблема — свежая SQLite DB могла иметь неполную схему

**Решение:** добавлена миграция `server/migrations/014_145_schema_alignment.sql`, `npm run db-audit`, `npm run fresh-db-smoke` и `tests/fresh-db.test.js`.

## Проблема — static e2e назывался real e2e

**Решение:** `verify` разделён на `verify:static`, `verify:server`, `verify:electron`; static scripts теперь честно подписаны как static checks.

## Проблема — client/server upload limits расходились

**Решение:** server `maxFileBytes` по умолчанию теперь не ниже video limit, client `maxAttachmentBytes` поднят до 100 MB.

## Проблема — inline UI actions могли ломаться незаметно

**Решение:** добавлен `npm run ui-actions-audit`, который собирает inline handlers и проверяет их на compatibility с safe bridge/named functions.

## Проблема — в проект могли попадать лишние runtime/build/tmp файлы

**Решение:** добавлен `npm run cleanup:report`; создан guide, что удалять перед коммитом.

## Проблема — release docs устаревали на 1.4.4

**Решение:** README, RELEASE_GUIDE, changelog, release-history и upload guide обновлены на 1.4.5.

## Что специально не делалось

- Не переписывался `renderer.js` целиком.
- Не заявлялся полный E2EE recovery bundle.
- Не удалялись файлы автоматически без review; вместо этого добавлен cleanup report.

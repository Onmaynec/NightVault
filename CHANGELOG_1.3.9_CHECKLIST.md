# NightVault 1.3.9 — Messenger Features Update

## Messenger
- Пересылка сообщений с повторным E2EE payload под новый чат.
- Мультивыбор сообщений 2.0: копирование, сохранение, пересылка и удаление.
- Saved Messages 2.0: локальное избранное для сообщений, файлов, голосовых, ссылок.
- История медиа/файлов/ссылок/голосовых в правой панели.
- Упоминания @username / @all / @admins с dropdown.
- Центр уведомлений, mute/DND, быстрые действия.
- Paste image/file из буфера и drag & drop preview перед отправкой.
- Профиль пользователя 2.0, блокировка и жалобы 2.0.

## Admin UI fixes
- Settings больше не оставляет пустое пространство справа/снизу.
- Admin themes теперь меняют фон, панели, borders, текст и accent.
- Добавлены единые интервалы между объектами и кнопками.
- Release/Update Center не выпускает GitHub Repo за карточку.
- Test Center не выпускает описание тестов за рамки.
- Sessions & Devices переносит длинные deviceId/user-agent внутри таблиц.
- Dashboard/Radmin URL переносится внутри карточек.

## Backup
- Импорт поддерживает .nvbackup v2 и старые JSON server-data из предыдущих версий.
- Перед импортом создаётся safety-backup.
- Checksum mismatch для legacy/repair не роняет весь импорт, а логируется предупреждением.

## Checks
- npm run verify — OK
- tests — 18 passed, 1 skipped

# NightVault 1.3.9 — Messenger Features Update

## Добавлено
- Пересылка сообщений с выбором чата и повторным E2EE payload под новый чат.
- Мультивыбор сообщений 2.0: копировать, сохранить, переслать, удалить.
- Saved Messages 2.0 как локальное избранное для сообщений, файлов, голосовых и ссылок.
- История медиа/файлов/ссылок/голосовых в правой панели чата.
- Упоминания @username / @all / @admins с dropdown.
- Центр уведомлений, mute/DND и улучшенный composer с paste/drag & drop.
- Профиль пользователя 2.0, блокировка и жалобы 2.0.

## Исправлено
- Админ Settings больше не пустует справа/снизу и получил живой preview темы.
- Admin themes теперь меняют фон, панели, обводки и текст, а не только accent.
- Release/Update карточки больше не выпускают длинный GitHub repo за пределы.
- Test Center карточки переносят status/duration/details/error.
- Sessions & Devices переносят длинные deviceId/user-agent в границах таблиц.
- Backup import поддерживает .nvbackup v2 и legacy JSON из прошлых версий.
- Dashboard/Radmin URL и длинные значения переносятся внутри карточек.

## Проверка
- npm run verify
- messenger-audit
- admin-audit
- release-audit

# NightVault Visual Regression Checklist 1.4.2

## Клиент
- Чат: нет вылезших voice/file cards, контекстное меню внутри окна.
- Профиль: кнопки не соприкасаются, fallback avatar 1–2 символа.
- Настройки: select/option/file/range/checkbox не белые.
- Группа: avatar upload, permissions, participants, buttons spacing.
- Контакты: поиск не стирается при refresh.
- Emoji: кнопка закрытия работает без unsupported action.
- Media viewer: blob/api images открываются без failed fetch.

## Админка
- Dashboard: URL и backup names переносятся.
- Settings: select не белый, borders мягкие, нет пустого layout.
- Updates: GitHub repo не вылезает.
- Sessions: deviceId/user-agent переносятся.
- Logs: debug/polling можно скрыть, строки переносятся.
- Backups: preview/dry-run JSON не ломает ширину.
- Tests: карточки не обрезают description/status/error.

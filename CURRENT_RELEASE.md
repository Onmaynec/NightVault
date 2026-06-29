# NightVault 1.3.5

Тестовый релиз для RadminVPN-сессий и групповых чатов.

## Главное

- Server Admin: live refresh каждую секунду для логов/БД/статуса.
- Server Admin: консольные команды `help`, `stats`, `info user <nick>`, `sessions <nick>`, `chat <id>`.
- Server Admin: темы админки Crimson / Aurora Purple / Obsidian / Blackout / Matrix.
- Чаты: мягкий polling активного чата и списка чатов, чтобы сообщения приходили даже при проблемах WS.
- Контакты: автообновление заявок и уведомления о новой заявке.
- Группы: стилизованная модалка передачи прав, добавление всех контактов в один клик, загрузка аватарки группы.
- Голосовые: финальный Telegram-like вид в теме NightVault без белого native audio.
- Toast “Сервер подключен” больше не спамит каждую секунду.
- GitHub Actions: публикация релиза через `softprops/action-gh-release`, без двойного создания release.

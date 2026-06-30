# NightVault 1.4.4 — Bugfix & Render Stability Update

## Исправлено

- Сохранение выбранного микрофона: `micSelect`, `nvMicId`, `nvSelectedMicId` и `S.micId` теперь синхронизируются.
- Кнопка «Обновить устройства» больше не вызывает `Неподдержанное UI-действие: nv141RefreshMicrophones?.()`.
- Проверка микрофона получила fallback при `OverconstrainedError`.
- Кнопка «Blur при потере фокуса» вынесена в безопасную функцию.
- Кнопка `Backup AES-GCM` во вкладке «Данные» вызывает стабильный export-flow.
- Кнопки E2EE Recovery 2.2 больше не используют optional chaining и inline-выражения.
- После загрузки баннера профиля preview и финальный banner URL корректно гидратируются.
- Убран устаревший текст `Приватность 1.0.9`.
- Поиск во вкладке «Люди → Мои контакты» обновляет только список контактов, а не всё приложение.
- После отправки ответа reply-preview над composer очищается.
- Усилен E2EE Recovery cache для истории после перезахода.
- WAV/аудио playback не показывает ошибку при окончании трека и stale play request.
- Предпросмотр сообщений, свой фон чата и glass blur получили CSS/logic fixes.

## Добавлено

- `nv144BugfixLayer` в renderer.
- Улучшенная совместимость inline-action bridge с optional calls.
- Документ передачи проекта другой нейросети.

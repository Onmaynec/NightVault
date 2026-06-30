# NightVault Admin Guide

1. Запусти `start-server-admin.bat`.
2. Войди в админку.
3. Dashboard показывает состояние сервера, пользователей, онлайн, размер базы, uploads, sockets, ошибки и последний backup.
4. Radmin/LAN Helper запускает сервер на `0.0.0.0:3000` и генерирует инструкцию для тестеров.
5. Console поддерживает команды `help`, `stats`, `users`, `online`, `info user <nick>`, `backup list`, `release check`, `security status`, `test all`.


# NightVault 1.4.0 — Security & Messenger Pro Update

## Главная цель
Довести NightVault до более серьёзного защищённого мессенджера: безопасность, приватность, модерация, качество клиента, контроль устройств и подготовка к публичному тестированию.

## Основные изменения
- Local PIN Lock, автоблокировка и blur mode.
- Trust Devices UI 2.0, Safety Number и fingerprint verification.
- Client Session Manager, Account Recovery 2.0 и 2FA wizard.
- Privacy Settings 2.0, Blocked Users 2.0, Reports Pro.
- Moderation Center и Security Audit Center в админке.
- Rate Limit / Anti-Spam 2.0, Safe Upload / File Quarantine.
- Backup Encryption и Migration Safety 2.0.
- Server Config UI.
- Markdown / Rich Text 1.0, Voice Messages Pro, Saved Messages Pro.
- Advanced Search 3.0, Group Moderation Pro, Message Edit History, Message Delete Modes.
- UI Kit 2.0, Adaptive Layout 2.0, Theme Studio, Accessibility pass.
- Real E2E Suite 2.0, Crash Report 2.0, Performance Audit.

## Fixes по тестовым скриншотам
- Исправлены интервалы между кнопками и элементами по всему клиенту.
- Исправлены fallback-аватарки без странной надписи.
- Исправлена установка аватарки группы через raw image upload.
- Модалки и окна теперь адаптируются под тему, а не остаются красными.
- Упоминания @all/@admins стали контрастными.
- Пересылка голосовых/файлов больше не падает из-за привязки файла к другому чату.
- ПКМ-меню снова ограничивается размерами окна.
- Добавлен локальный E2EE recovery cache для уже расшифрованной истории.
- Окно изменений показывает полный changelog.

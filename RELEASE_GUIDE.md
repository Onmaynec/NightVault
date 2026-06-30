# Release guide — NightVault 1.0.0

1. Выполнить `npm ci` и `npm run verify`.
2. Убедиться, что `npm audit` не сообщает известных уязвимостей.
3. Настроить GitHub secrets `CSC_LINK` и `CSC_KEY_PASSWORD` для подписи Windows.
4. Обновить `assets/changelog.json` и release notes.
5. Создать тег:

```bash
git tag v1.0.0
git push origin v1.0.0
```

6. GitHub Actions соберёт NSIS и portable артефакты, blockmap/latest.yml и SHA-256 checksums.
7. Проверить подпись, установить на чистую Windows VM и проверить регистрацию, сообщения, вложения, обновление и удаление.
8. Не заявлять E2EE: оно не входит в 1.0.0.


# NightVault 1.4.1 — Stability, UX Polish & E2EE Recovery Fix Update

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

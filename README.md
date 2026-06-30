# NightVault 1.4.1

Тестовый Windows-релиз с исправлениями после 1.3.0: многоклиентный запуск, изоляция сессий, авто-пересинхронизация E2EE-ключей, двухпанельный интерфейс вкладок, исправленное меню эмодзи и чистка release-файлов.

## Запуск

```bat
npm install
npm run verify
start-client.bat
```

`start-client.bat` теперь запускает клиент в изолированном тестовом профиле, чтобы несколько клиентов на одном ПК не перебивали друг другу сессии, localStorage и E2EE-ключи.

Для постоянного профиля:

```bat
start-client-default-profile.bat
```

Для имени профиля вручную:

```bat
start-client-profile.bat test-account-1
```

Админка:

```bat
start-server-admin.bat
```

Логин: `admin`  
Пароль первого входа генерируется в `admin-first-login.txt` или задаётся через `NIGHTVAULT_ADMIN_PASSWORD`

## Release history

Старые `RELEASE_NOTES_*` и `RELEASE_MANIFEST_*` убраны из корня. История теперь лежит в `release-history/` одним файлом на версию:

- `read_version1.3.1FixedRELEASE.md`
- `read_version1.3.1Fixed2RELEASE.md`
- `read_version1.4.1RELEASE.md`

## Проверка

```bat
npm run verify
```

Дополнительно добавлена проверка:

```bat
npm run ui-audit
```


## NightVault 1.4.1

Messenger Features Update: пересылка, мультивыбор, Saved Messages 2.0, история медиа, упоминания, уведомления, DND, paste/drag&drop, профиль 2.0, блокировки, жалобы и исправления адаптивности админки.


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

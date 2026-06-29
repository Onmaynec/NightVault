# NightVault 1.3.5

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
- `read_version1.3.5RELEASE.md`

## Проверка

```bat
npm run verify
```

Дополнительно добавлена проверка:

```bat
npm run ui-audit
```

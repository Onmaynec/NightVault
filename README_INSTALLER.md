# NightVault 1.0.0 — Windows installer

Сборка:

```cmd
npm ci
npm run verify
npm run build:installer
```

Файл:

```text
dist\NightVault-Setup-1.3.6.exe
```

Установщик содержит клиент и встроенный локальный сервер. Пользователю не нужен Node.js. Данные локального сервера сохраняются в каталоге профиля приложения и не удаляются при обычном обновлении.

Для публичной публикации задайте `CSC_LINK` и `CSC_KEY_PASSWORD`, подпишите артефакт и приложите `SHA256SUMS.txt`, `latest.yml` и `.blockmap`.


## Installer hotfix

Packaged builds store server runtime data in `%APPDATA%\NightVault\server` instead of `resources\app.asar`, so the installed EXE can start without `ENOTDIR` write errors.

# NightVault 1.4.1 — установка для тестеров

## Что скачивать

Тестеру нужен файл из GitHub Releases:

```text
NightVault-Setup-1.4.1.exe
```

После установки тестеру не нужно устанавливать Node.js и не нужно выполнять `npm install`. Установщик Electron уже содержит runtime и зависимости приложения.

## Установка

1. Запусти `NightVault-Setup-1.4.1.exe`.
2. В установщике оставь включённой галочку создания ярлыка на рабочем столе, если нужен ярлык клиента.
3. Заверши установку.
4. Запусти NightVault с рабочего стола или из меню Пуск.

## Подключение к серверу через Radmin VPN

В поле адреса сервера укажи:

```text
http://26.4.1.76:3000
```

Не используй `127.0.0.1`, потому что это локальный компьютер тестера.

## Проверка доступа до сервера

В PowerShell можно проверить:

```powershell
Test-NetConnection 26.4.1.76 -Port 3000
```

Нужно, чтобы было:

```text
TcpTestSucceeded : True
```


## Installer hotfix

Packaged builds store server runtime data in `%APPDATA%\NightVault\server` instead of `resources\app.asar`, so the installed EXE can start without `ENOTDIR` write errors.

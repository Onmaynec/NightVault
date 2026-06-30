# Как собрать Windows EXE-установщик NightVault

## Рекомендуемый вариант

Собирать установщик нужно на Windows. Финальный установщик не требует Node.js на компьютерах тестеров: Electron упаковывает runtime и `node_modules` внутрь приложения.

## Локальная сборка

Открой PowerShell или CMD в папке проекта и выполни:

```bat
build-installer.bat
```

Скрипт:

1. проверит Node.js и npm;
2. при отсутствии Node.js попробует поставить Node.js LTS через winget;
3. выполнит `npm install`;
4. выполнит проверку синтаксиса;
5. соберёт NSIS installer через electron-builder.

Результат будет в папке:

```text
dist\NightVault-Setup-1.4.4.exe
```

## Полная сборка installer + portable

```bat
build-windows-release.bat
```

Результат также будет в `dist/`.

## Ярлык на рабочем столе

В `package.json` включена NSIS-настройка:

```json
"createDesktopShortcut": true
```

Так как `oneClick` выключен, установщик запускается в ручном режиме и должен показывать настройки установки, включая создание ярлыка.

## GitHub Actions

После пуша тега:

```bat
git tag v1.4.4
git push origin v1.4.4
```

GitHub Actions workflow `.github/workflows/release.yml` соберёт Windows artifacts и прикрепит их к сборке.


## Installer hotfix

Packaged builds store server runtime data in `%APPDATA%\NightVault\server` instead of `resources\app.asar`, so the installed EXE can start without `ENOTDIR` write errors.

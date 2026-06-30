# Как залить NightVault 1.4.5 в GitHub

## Вариант A — если работаешь из готовой папки проекта

```bat
cd "C:\Users\Мамлеев Роман\Downloads\NightVault-1.4.5-release-source"
npm install
npm run verify
npm run cleanup:report
```

Проверить, что нет лишних runtime/build файлов:

```bat
git status --short
```

Добавить и залить:

```bat
git add -A
git commit -m "Release NightVault 1.4.5"
git branch -M main
git remote remove origin
git remote add origin https://github.com/Onmaynec/NightVault.git
git push -u origin main
```

Тег релиза:

```bat
git tag -f v1.4.5
git push origin v1.4.5 --force
```

## Вариант B — если используешь patch-архив

1. Распакуй архив `NightVault-1.4.5-patch.zip` поверх корня проекта.
2. Разреши замену файлов.
3. Запусти:

```bat
npm install
npm run verify
npm run cleanup:report
git status --short
```

4. Если `cleanup:report` нашёл мусор, удали только явно лишнее: `dist/`, `node_modules/`, `.cache/`, `.log`, `.tmp`, runtime data.
5. Коммит:

```bat
git add -A
git commit -m "Release NightVault 1.4.5 reliability update"
git push origin main
git tag -f v1.4.5
git push origin v1.4.5 --force
```

## Ожидаемые assets после сборки

```text
NightVault-Setup-1.4.5.exe
NightVault-Setup-1.4.5.exe.blockmap
NightVault-1.4.5-x64.exe
latest.yml
```

## Что проверить перед публикацией Release

- `npm run verify` прошёл.
- `npm run fresh-db-smoke` прошёл на чистом data dir.
- `npm run cleanup:report` не показывает случайно закоммиченный runtime.
- На Windows вручную проверены 2 клиента, чат, файл, голосовое, перезапуск, readiness.
- В release notes не обещан полный E2EE recovery bundle.

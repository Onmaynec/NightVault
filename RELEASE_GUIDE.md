# NightVault 1.4.7 release guide

## 1. Применение patch-архива

Распакуй `NightVault-1.4.7-patch.zip` в корень проекта поверх версии 1.4.6.

```bat
cd путь\к\NightVault
npm run apply:147
```

## 2. Проверка

```bat
npm install
npm run verify
npm run ui-actions:audit
npm run ui-actions:report
npm run csp:audit
npm run no-render-in-input-audit
npm run legacy:audit
npm run reliability-147-audit
npm test
```

## 3. Реальная Electron проверка

```bat
set NIGHTVAULT_FORCE_REAL_ELECTRON=1
npm run e2e:real
start-server-admin.bat
start-client-profile.bat test-account-1
start-client-profile.bat test-account-2
```

Проверить вручную: авторизация, чаты, контакты, профиль, настройки, E2EE Health, context menu, emoji panel, debug pack, админка.

## 4. Сборка

```bat
npm run build:installer
npm run build:portable
npm run release-assets-check
```

Ожидаемые assets:

```text
NightVault-Setup-1.4.7.exe
NightVault-Setup-1.4.7.exe.blockmap
NightVault-1.4.7-x64.exe
latest.yml
checksums.sha256
NightVault-1.4.7-source.zip
```

## 5. Заливка

```bat
git status --short
git add -A
git commit -m "Release NightVault 1.4.7"
git push origin main
git tag -f v1.4.7
git push origin v1.4.7 --force
```

## 6. Rollback

```bat
git tag -d v1.4.7
git push origin :refs/tags/v1.4.7
git revert HEAD
```

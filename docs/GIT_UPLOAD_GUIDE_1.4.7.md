# Git upload guide — NightVault 1.4.7

## 1. Распаковать patch

```bat
cd путь\к\NightVault
```

Распакуй `NightVault-1.4.7-patch.zip` поверх корня проекта с заменой файлов.

## 2. Применить patch script

```bat
npm run apply:147
```

Если `npm` ещё не видит команду, запусти напрямую:

```bat
node scripts/apply-147-patch.js
```

## 3. Проверить

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

## 4. Real Electron smoke

```bat
set NIGHTVAULT_FORCE_REAL_ELECTRON=1
npm run e2e:real
```

## 5. Git

```bat
git status --short
git add -A
git commit -m "Release NightVault 1.4.7 UI Action Router and CSP hardening"
git push origin main
git tag -f v1.4.7
git push origin v1.4.7 --force
```

## 6. Проверить GitHub Release

Ожидаемые assets:

```text
NightVault-Setup-1.4.7.exe
NightVault-Setup-1.4.7.exe.blockmap
NightVault-1.4.7-x64.exe
latest.yml
checksums.sha256
NightVault-1.4.7-source.zip
```

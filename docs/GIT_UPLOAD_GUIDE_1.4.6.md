# Git upload guide — NightVault 1.4.6

1. Распакуйте архив `NightVault-1.4.6-patch.zip` в корень проекта.
2. Выполните точечный patch legacy-файлов:

```bat
npm run apply:146
```

3. Проверьте проект:

```bat
npm install
npm run verify:static
npm run verify:server
npm run verify:electron
npm run release:qa
```

4. На Windows/test VM запустите real Electron smoke:

```bat
set NIGHTVAULT_FORCE_REAL_ELECTRON=1
npm run e2e:real
```

5. Соберите релиз:

```bat
npm run build:installer
npm run build:portable
npm run release-assets-check
```

6. Залейте в GitHub:

```bat
git status --short
git add -A
git commit -m "Release NightVault 1.4.6"
git push origin main
git tag -f v1.4.6
git push origin v1.4.6 --force
```

7. Проверьте GitHub Release assets:

- `NightVault-Setup-1.4.6.exe`
- `NightVault-Setup-1.4.6.exe.blockmap`
- `NightVault-1.4.6-x64.exe`
- `latest.yml`
- `checksums.sha256`

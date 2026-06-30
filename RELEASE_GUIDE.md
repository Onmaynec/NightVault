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

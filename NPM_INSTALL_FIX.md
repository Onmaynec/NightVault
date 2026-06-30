# NPM install fix

Если `npm install` падает на `read-binary-file-arch-1.0.7.tgz` с ошибкой 404, причина в битой транзитивной зависимости Electron tooling.

В этом архиве исправлено:

- удалён старый `package-lock.json`;
- добавлены `overrides` в `package.json`:
  - `read-binary-file-arch` -> `1.0.6`;
  - `yauzl` -> `^3.3.1`.

После распаковки запустите:

```bat
npm cache clean --force
npm install
npm run check
npm start
```

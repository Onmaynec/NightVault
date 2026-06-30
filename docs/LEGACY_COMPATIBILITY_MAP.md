# NightVault 1.4.7 Legacy Compatibility Map

## Правило

`renderer.js` нельзя переписывать целиком. Старые глобальные функции сохраняются как compatibility API, а новые кнопки и контролы должны обращаться к ним через `data-action`.

## Оставить в 1.4.7

| Legacy element | Reason | Replacement |
|---|---|---|
| `src/renderer/actions.js` | Подхватывает старые inline handlers из HTML-строк | `src/client/ui-action-router-147.js` |
| `window.saveSettings` | Используется существующими настройками | `data-action="settings.save"` |
| `window.saveProfile` | Используется профилем | `data-action="profile.save"` |
| `window.changeAvatar` | Upload flow не выносится в 1.4.7 | `data-action="profile.avatar.pick"` |
| `window.openE2eeTrust` | E2EE UI не переписывается в 1.4.7 | `data-action="e2ee.health.open"` |
| `window.nv144TestMicrophone` | Voice flow совместимость с 1.4.4 | `data-action="voice.testMic"` |

## Кандидаты на удаление после тестов

- Inline `localStorage.x = ...; render()` expressions.
- Inline `document.querySelector(...).remove()` expressions.
- Дублирующиеся named handlers, которые полностью покрыты router actions и real Electron smoke.

## Защитные проверки

```bat
npm run ui-actions:audit
npm run ui-actions:report
npm run legacy:audit
npm run e2e:real
```

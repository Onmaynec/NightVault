# NightVault 1.3.3 — checklist

- ✅ Голосовые сообщения приведены к компактному стилю Telegram/NightVault.
- ✅ Воспроизведение голосового восстанавливается после перерендера сообщений.
- ✅ Реакции и ответ на старое сообщение больше не должны принудительно скроллить чат вниз.
- ✅ В группах аватарки пользователей берутся из известных профилей/контактов.
- ✅ Фото предпросмотр исправлен: без чёрной полосы справа, object-fit: contain.
- ✅ Клик по аватарке сообщения открывает профиль пользователя.
- ✅ Текст «Зашифрованное сообщение» над сообщениями скрыт.
- ✅ Настройка скрытия правой панели удалена, правая панель закреплена.
- ✅ Auto-update переведён на https://github.com/Onmaynec/NightVault и semver v1.3.3.
- ✅ Добавлены security-фиксы из аудита: admin first-run password, timing-safe verify, WS Origin, JSON depth, safe Content-Type, log sanitization, sync id guard, ReDoS query cap.
- ❌ Полный CSP-lockdown и отказ от inline event handlers не сделан: текущий renderer ещё использует onclick; резкое отключение script-src-attr сломает UI, нужен отдельный refactor.
- ❌ Полный отказ от innerHTML не сделан: это большой рефактор всего renderer.js; в 1.3.3 сохранены escaping/guards и точечные XSS-укрепления.
- ❌ Полный перевод E2EE на non-extractable IndexedDB ключи не сделан: частично используется Electron safeStorage/shared vault; полный перенос требует миграции ключей и совместимости со старыми сообщениями.

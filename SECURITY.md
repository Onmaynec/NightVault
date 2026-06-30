# Security policy and threat model

## Реализовано в 1.0.0

- bcrypt-хеширование паролей;
- access/refresh sessions с ограниченным сроком действия и ротацией;
- сервер хранит только хеши токенов;
- одноразовые WebSocket tickets;
- TOTP 2FA и одноразовые recovery-коды;
- AES-256-GCM для серверных TOTP secrets;
- защищённое хранилище токенов через Electron `safeStorage` (не сохраняется при небезопасном backend `basic_text`);
- авторизованный endpoint вложений с проверкой участия в чате;
- rate limiting, лимиты размера и блокировка активных/исполняемых файлов;
- Electron sandbox, context isolation, запрет webview, popup и навигации;
- Content Security Policy без `unsafe-eval`;
- PBKDF2-SHA256 для локальной блокировки;
- AES-256-GCM + PBKDF2-SHA256 для экспортируемых backup.

## Не реализовано

- E2EE/Signal Protocol;
- защита метаданных от сервера;
- аппаратная аттестация устройств;
- независимый security audit;
- автоматическое антивирусное сканирование вложений;
- production-grade SQL storage и multi-node coordination;
- гарантированная подпись бинарников — требуется сертификат владельца проекта.

## Модель доверия

Администратор сервера и любой, кто получил доступ к серверной базе или master key, способен прочитать сообщения. TLS защищает транспорт, но не защищает данные от самого сервера.

## Production checklist

1. Размещайте сервер только за HTTPS/WSS или настройте прямой TLS.
2. Установите отдельный `NIGHTVAULT_DATA_DIR` с правами только для service account.
3. Храните `NIGHTVAULT_MASTER_KEY` в secret manager и создавайте зашифрованные резервные копии.
4. Ограничьте `NIGHTVAULT_CORS_ORIGINS` нужными Origin.
5. Не публикуйте порт JSON-сервера напрямую без firewall/reverse proxy.
6. Подпишите Windows installer и проверяйте SHA-256.
7. Проведите внешний аудит до заявления о защищённом мессенджере.

## Сообщение об уязвимости

Не публикуйте zero-day в открытом issue. До релиза укажите отдельный security email или включите GitHub Private Vulnerability Reporting.


# NightVault 1.4.3 — Stability, UX Polish & E2EE Recovery Fix Update

## Главная цель
Довести NightVault до более серьёзного защищённого мессенджера: безопасность, приватность, модерация, качество клиента, контроль устройств и подготовка к публичному тестированию.

## Основные изменения
- Local PIN Lock, автоблокировка и blur mode.
- Trust Devices UI 2.0, Safety Number и fingerprint verification.
- Client Session Manager, Account Recovery 2.0 и 2FA wizard.
- Privacy Settings 2.0, Blocked Users 2.0, Reports Pro.
- Moderation Center и Security Audit Center в админке.
- Rate Limit / Anti-Spam 2.0, Safe Upload / File Quarantine.
- Backup Encryption и Migration Safety 2.0.
- Server Config UI.
- Markdown / Rich Text 1.0, Voice Messages Pro, Saved Messages Pro.
- Advanced Search 3.0, Group Moderation Pro, Message Edit History, Message Delete Modes.
- UI Kit 2.0, Adaptive Layout 2.0, Theme Studio, Accessibility pass.
- Real E2E Suite 2.0, Crash Report 2.0, Performance Audit.

## Fixes по тестовым скриншотам
- Исправлены интервалы между кнопками и элементами по всему клиенту.
- Исправлены fallback-аватарки без странной надписи.
- Исправлена установка аватарки группы через raw image upload.
- Модалки и окна теперь адаптируются под тему, а не остаются красными.
- Упоминания @all/@admins стали контрастными.
- Пересылка голосовых/файлов больше не падает из-за привязки файла к другому чату.
- ПКМ-меню снова ограничивается размерами окна.
- Добавлен локальный E2EE recovery cache для уже расшифрованной истории.
- Окно изменений показывает полный changelog.

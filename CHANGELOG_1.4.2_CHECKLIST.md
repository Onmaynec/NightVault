# NightVault 1.4.2 — Public Beta Hardening & Architecture Update

## Добавлено
- Renderer architecture cleanup phase 1.
- UI Action Router.
- E2EE Recovery Layer 2.1.
- Backup Compatibility Matrix и dry-run import.
- Safe Update Flow / Update Assistant.
- Windows smoke test script.
- e2e:real static Electron flow checks.
- Visual Regression Checklist.
- Native Controls Cleanup.
- Micro UI Kit 2.1.
- Theme Engine 2.1.
- File Pipeline 2.1.
- Voice Recorder 2.1.
- Notification Center 2.1.
- Admin Logs 3.0.
- Admin Command Help 3.0.
- Server Health Alerts.
- Radmin Helper 3.0.
- Installer / Release Hardening 2.0.
- Public Tester Mode.

## Исправлено
- `npm run verify` больше не падает из-за теста, ожидавшего старую версию 1.3.9.
- Белые native controls в тёмной теме заменены theme-aware стилями.
- Выбор микрофона закреплён в настройках и получил проверку доступа.
- Backup можно проверить без импорта.
- Длинные URL, deviceId, fileId, логи и JSON лучше переносятся в админке.

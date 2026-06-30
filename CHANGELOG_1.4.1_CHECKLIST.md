# NightVault 1.4.2 — Stability, UX Polish & E2EE Recovery Fix Update

## Реализовано

- E2EE Recovery Layer 2.0.
- Legacy DB Import 2.0 для баз 1.3.6–1.4.0.
- Backup Restore UX 2.1 с preview/checksum/report.
- Исправление пересылки файлов и голосовых через копирование attachment под новый чат.
- Group Avatar Fix 2.0: отдельный raw image upload и проверка MIME/magic bytes.
- Fallback Avatar Fix: 1–2 символа, без случайных слов внутри круга.
- UI Spacing Audit по клиенту и админке.
- Context Menu Boundary Fix 3.0.
- Theme Consistency Fix: CSS variables вместо жёсткого crimson.
- Mention Chips Fix.
- Voice Player Stability 2.0.
- Changelog Window 2.0.
- Admin UI Polish 2.1.
- Admin Import Error Details.
- Server Config Validation.
- Rate Limit UX.
- File Quarantine UX.
- Markdown Safety Fix.
- Search Performance Fix.
- Crash Report 2.1.
- Исправлен выбор микрофона.
- Исправлена кнопка закрытия emoji-panel.

## Проверки

- npm run verify
- npm run perf-audit
- npm run security-pro-audit

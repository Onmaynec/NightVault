# NightVault server deployment

## Рекомендуемая схема

```text
Electron clients -> HTTPS/WSS reverse proxy -> NightVault server on 127.0.0.1:3000
```

Пример переменных:

```bash
NIGHTVAULT_HOST=127.0.0.1
NIGHTVAULT_PORT=3000
NIGHTVAULT_DATA_DIR=/var/lib/nightvault
NIGHTVAULT_PUBLIC_URL=https://chat.example.com
NIGHTVAULT_CORS_ORIGINS=null,https://chat.example.com
NIGHTVAULT_ACCESS_MINUTES=30
NIGHTVAULT_REFRESH_DAYS=30
NIGHTVAULT_MAX_FILE_MB=50
NIGHTVAULT_MASTER_KEY=<32-byte base64 or 64-char hex secret>
```

Если TLS завершается непосредственно Node.js:

```bash
NIGHTVAULT_TLS_CERT=/etc/nightvault/fullchain.pem
NIGHTVAULT_TLS_KEY=/etc/nightvault/privkey.pem
```

## systemd outline

```ini
[Unit]
Description=NightVault server
After=network.target

[Service]
Type=simple
User=nightvault
WorkingDirectory=/opt/nightvault
EnvironmentFile=/etc/nightvault.env
ExecStart=/usr/bin/node server/server.js
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/nightvault

[Install]
WantedBy=multi-user.target
```

## Backup

Останавливать сервер необязательно: JSON записывается через временный файл и rename. Для согласованного backup копируйте весь `NIGHTVAULT_DATA_DIR`, включая `data.json`, `uploads/` и master key. Шифруйте backup вне сервера.

## Ограничение масштаба

Текущее JSON-хранилище предназначено для одного процесса и небольшой инсталляции. Перед горизонтальным масштабированием перенесите users/sessions/chats/messages/files в PostgreSQL, WebSocket presence — в Redis, а вложения — в объектное хранилище.

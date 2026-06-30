# NightVault 1.4.7 RELEASE

## UI Action Router & CSP Hardening Update

### Added

- UI Action Router 1.4.7 compatibility layer.
- Strict CSP diagnostics and violation telemetry.
- Admin actions layer.
- UI actions audit/report.
- CSP consistency audit.
- No render in input audit.
- Legacy compatibility audit.
- UI action test plan and action maps.

### Changed

- New UI actions should use `data-action` or `data-admin-action`.
- `script-src-attr 'unsafe-inline'` is replaced with `script-src-attr 'none'` by the patch script.
- `renderer.js` receives only a small `nv147UiActionLayer`, not a full rewrite.

### Security

- Reduced dependence on inline JS attributes.
- CSP violations are captured for debug packs.
- Legacy handlers are documented and audited.

### Known limitations

- `actions.js` remains as legacy fallback.
- `style-src 'unsafe-inline'` remains for dynamic UI styling.
- Full removal of legacy inline handlers may continue in 1.4.8/1.5 after real Electron coverage confirms safety.

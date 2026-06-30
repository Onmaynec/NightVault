# NightVault 1.4.6 changeset

Implemented as a patch set on top of 1.4.5.

## Files changed or added

- package/version/release docs updated to 1.4.6.
- New QA scripts for static vs real Electron testing.
- New release QA scripts and cleanup/source packaging tools.
- Updated renderer core version marker.
- Added UI action and legacy compatibility documentation.
- Added apply script for large legacy files (`renderer.js`, `admin-renderer.js`).

## What must be checked manually

- Real Electron smoke on Windows/test VM.
- Two client profiles on one PC.
- Message/file sending in actual UI.
- E2EE Health wording and resync button visibility.
- Release assets from electron-builder.

## What is intentionally not claimed

- Full E2EE recovery bundle is not implemented in 1.4.6.
- `renderer.js` is not fully modularized in 1.4.6.

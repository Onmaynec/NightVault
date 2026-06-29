# NightVault 1.1.0 Foundation Roadmap

Version 1.0.9 prepares the codebase for the larger 1.1.0 branch. The next major work should be done in separate, reviewable phases.

## Phase 1 — Data layer

- Introduce SQLite as the default local server database.
- Keep JSON import/export for migration and emergency recovery.
- Add schema migrations with rollback notes.

## Phase 2 — E2EE key layer

- Generate device identity keys on the client.
- Add public key discovery and verification UI.
- Encrypt message payloads before sending to the server.
- Keep the current server-side storage model as a compatibility path during migration.

## Phase 3 — Modular routes and services

- Move auth, users, chats, messages, contacts, files and security routes out of `server/server.js`.
- Keep existing endpoints stable.
- Add contract tests for every route group.

## Phase 4 — Sync engine

- Introduce local pending operation queue.
- Add conflict-safe retry semantics.
- Prepare offline-first message, contact and profile updates.

## Phase 5 — Product polish

- Finish the design system: spacing scale, components, empty states and mobile breakpoints.
- Improve onboarding and diagnostics.
- Add guided security setup: PIN, 2FA, backup and device review.

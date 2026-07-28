# NightGDPS Core

NightGDPS Core is the server-side fork used by NightGDPS.

## Upstream

This project is based on `Cvolton/GMDprivateServer`.

Pinned upstream revision for the bootstrap phase:

`719dfe36c622a54c8162b07967241fce79b2497c`

The upstream project supports Geometry Dash 1.0–2.2 and is licensed under GNU GPL v3. NightGDPS Core keeps the GPL v3 license for code derived from GMDprivateServer and preserves upstream attribution.

## Goal

The first goal is not to rewrite the Geometry Dash protocol. We keep the proven Cvolton-compatible endpoints and simplify the internals around the features NightGDPS actually uses.

Planned core modules:

- Accounts and authentication
- Users and profiles
- Levels and level search/download/upload
- Comments
- Scores and leaderboards
- Songs
- Cloud save
- Daily / Weekly
- NightGDPS Events
- Moderator commands
- Roles and permissions
- Creator Points

Features that are not required by NightGDPS will be reviewed before being carried into the new core.

## Rules for the fork

1. Preserve Geometry Dash protocol compatibility first.
2. Do not silently change database semantics during migration.
3. Database changes must be explicit migrations.
4. NightGDPS-specific features live in clearly named code paths instead of hidden hosting-panel patches.
5. Server secrets and production credentials never belong in Git.
6. Every migrated PHP file must pass `php -l` before deployment.

## Database migrations

NightGDPS-specific schema changes will be tracked under:

`server-core/migrations/`

This is intended to replace the current situation where the live database can drift away from the PHP code without a record of when or why a column was added.

## Bootstrap plan

### Phase 1 — establish a clean baseline

- Pin the exact Cvolton revision above.
- Inventory endpoints and libraries NightGDPS actually uses.
- Separate required protocol code from optional dashboard/tools code.
- Document the current NightGDPS database differences.

### Phase 2 — migrate NightGDPS features

Bring over only the versions that have already been proven on the live server:

- Event system and Event rewards
- Event Safe de-duplication
- `!event`, `!eventset`, `!eventchange`, `!eventinfo`, `!unevent`
- `!unrate`
- existing `!delete` behavior
- Creator Points recalculation
- MOD Suggest Stars integration
- level copy/download fix

### Phase 3 — VDS deployment

Target stack:

- Linux
- Nginx
- PHP-FPM
- MariaDB

The current GlowHosting server remains untouched until the new core passes functional tests against a copy of the NightGDPS database.

## Important migration principle

The old server is the source of truth for player data. We do not redesign tables while moving production data. First we reproduce the existing behavior on the new core; cleanup and schema normalization come only after the migrated server is stable.

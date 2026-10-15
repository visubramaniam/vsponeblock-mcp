# Changelog

## Unreleased

### Added

- **Claude Code plugin, vsponeblock-community** (`plugin/`), installable with `/plugin marketplace add visubramaniam/vsponeblock-mcp`. It runs vsponeblock-mcp 0.1.0 from a lockfile of npm registry packages with integrity hashes, asks for the storage system URL, user and password (kept in the system credential store), and adds two skills: `vsponeblock-capacity-report` (pool and array capacity, subscription, data reduction, with unit conversion) and `vsponeblock-health-check` (health status, alerts, drives, pools and replication pairs). `tests/unit/plugin.test.mjs` checks the plugin's version, lockfile and settings. See README.plugin.md.
- **Docker Hub:** the 0.1.0 image is now also at `docker.io/subramaniamv/vsponeblock-mcp` (`linux/amd64` and `linux/arm64`), alongside ghcr.io.

## 0.1.0 — 2026-10-15

First community release of vsponeblock-mcp, forked from [vsp360-mcp](https://github.com/visubramaniam/vsp360-mcp) 0.1.21 and adapted to the Hitachi VSP One Block REST API. The fork keeps vsp360-mcp's git history up to that release.

### Added

- **The VSP One Block REST API (microcode 10.5.4)** in `spec/vsponeblock-10.5.4.yaml`: 425 operations across the simple API (`/simple/v1/...`) and the detail API (`/v1/objects/...`), through the same three discovery tools, `vsponeblock_list_operations`, `vsponeblock_describe_operation` and `vsponeblock_call_operation`, and optional direct tools per tag.
- **Session sign-in.** The server opens a session with `POST /ConfigurationManager/v1/objects/sessions` using `VSPONEBLOCK_USER` and `VSPONEBLOCK_PASSWORD`, sends `Authorization: Session <token>`, replaces a session that may have idled out (`VSPONEBLOCK_SESSION_ALIVE_TIME`, default 300 seconds), retries once with a new session after a 401, and discards its session on exit. Operations whose spec asks for Basic authentication (DKC power state) or none (version, storage list) get exactly that. A full session table (HTTP 503) is reported with what to do.
- **`/ConfigurationManager` is added to `VSPONEBLOCK_URL`** unless the URL already ends with it.
- **Search tuned for block storage:** storage synonyms (LUN, host, WWN, GAD, TrueCopy, ShadowImage, QoS, ...), example questions for 68 common operations, and labelled tuning and held-out request sets with regression thresholds (46/48 and 14/20 top-1).

### Changed

- **Settings are named `VSPONEBLOCK_*`** instead of `VSP360_*`. `VSPONEBLOCK_CLIENT_ID`, `_CLIENT_SECRET` and `_SCOPE` are replaced by `VSPONEBLOCK_USER` and `VSPONEBLOCK_PASSWORD`.
- **Read-only mode** allows `GET` operations and downloading a configuration report. Every upload is a write in this API, so read-only mode refuses them all.
- **No default path rewrite.** `VSPONEBLOCK_PATH_REWRITES` is still available for APIs behind a gateway.

### Removed

- VSP 360-only features: the Analytics (MQL) field reference, the learned decision hint and its training and batch-collection scripts, the secret-read gate (no VSP One Block read returns a credential), and the vsp360-community Claude Code plugin. The opt-in decision log remains.

### Known limitations

- Remote copy operations that need a session on the remote storage system (`Remote-Authorization` header) can't pass that header yet.
- `all_pages` has no effect: this API pages by query parameters (`count`, `headLdevId`, `startVolumeId`), not page links.

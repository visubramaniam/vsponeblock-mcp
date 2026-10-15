---
name: vsponeblock-health-check
description: Quick health check of a Hitachi VSP One Block storage system using the vsponeblock MCP server. Use when asked whether the array is healthy, what's wrong, what alerts or SIMs are open, whether drives have failed or replication pairs are suspended, or for a daily or pre-change status summary.
---

# VSP One Block health check

Use the `vsponeblock` MCP server. Gather a few read-only facts, then summarize them in one short report. Call operations with `vsponeblock_call_operation`; if a parameter isn't clear, describe the operation with `vsponeblock_describe_operation` first.

## Steps

1. **Which array:** `getStorage` gives the model, serial number and microcode version, to name the system in the report.
2. **Overall status:** `healthStatusGet` summarizes pools, snapshots and global-active device (active-active mirroring) pairs, and lists the abnormal items in each.
3. **Alerts:** `getAlertList` with `type: "DKC"` lists the alerts (SIMs) retained by the storage system, newest first; pass `count` (e.g. 50) to limit them. On VSP One Block 20 series you can also check `CTL1` and `CTL2`; on VSP One Block 85, `AMC0` and `AMC1`. Group them by `errorLevel` and note the time of the newest and oldest.
4. **Drives:** `drivesGet` lists drives with their `status`; name any that isn't `Normal`, and note spare drives. `getDriveList` adds endurance (`usedEnduranceIndicator`) for flash drives.
5. **Pools:** `poolsGet` gives each pool's `status`; flag any that isn't `Normal`.
6. **Replication (if the array has any):** `getRemoteCopypairList` needs `replicationType`: `GAD`, `TC` (TrueCopy) or `UR` (Universal Replicator). Flag pairs that aren't in `PAIR` status. For local ShadowImage pairs, use `getLocalReplicationList`.

## The report

- **Start with a one-line verdict:** healthy, degraded or critical, and why.
- **Then list:** abnormal items from the health status; serious alerts (what, where, when); failed or blocked drives; pools not in `Normal` status; suspended pairs.
- **Give the time** of the check, and keep it short. Offer to dig into any item rather than dumping raw data.
- **Don't speculate about causes** the data doesn't show. Alerts carry a `referenceCode` and `actionCodes`; quote them so the user can look them up or raise them with support.

## Safety

The health check is read-only. Don't resync, split, restore or change anything unless the user explicitly asks, and even then confirm first.

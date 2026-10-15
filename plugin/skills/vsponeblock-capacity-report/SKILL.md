---
name: vsponeblock-capacity-report
description: Capacity and efficiency reporting for a Hitachi VSP One Block storage system, using the vsponeblock MCP server. Use when asked about pool or array capacity, free space, usage, subscription or over-commitment, data reduction, compression or deduplication savings, or when a capacity report is needed.
---

# VSP One Block capacity report

Use the `vsponeblock` MCP server. Call operations with `vsponeblock_call_operation`; if a parameter isn't clear, describe the operation with `vsponeblock_describe_operation` first.

## Steps

1. **The array:** `storageGet` gives the model, serial number and array-wide pool totals (`totalPoolCapacity`, `usedPoolCapacity`, `freePoolCapacity`) and `savingEffects`. `getStorage` adds the microcode version (`dkcMicroVersion`).
2. **Each pool:** `poolsGet` lists pools with `totalCapacity`, `usedCapacity`, `freeCapacity`, `status`, `numberOfVolumes`, `subscriptionLimit` and `savingEffects`. For tiering or a pool type the simple API doesn't show, use `getPoolList` (detail API).
3. **Data reduction:** `getTotalEfficiency` gives the total, compression and deduplication ratios, the snapshot ratio and the provisioning rate, with the time they were calculated (`calculationEndTime`).
4. **Physical capacity (optional):** `getTotalCapacity` gives total and free space for internal and external volumes.
5. **Volumes in a pool (if asked):** `volumesGet` with `poolId`. Use `count` and `startVolumeId` to page through large lists, and `save_to` (e.g. `"volumes.json"`) for long results instead of reading them all into the conversation.

## Units

The API mixes units: the simple API (`storageGet`, `poolsGet`, `volumesGet`) reports **MiB**, while `getTotalCapacity` reports **KB**. Convert everything to GiB or TiB (1 TiB = 1,048,576 MiB) and say which unit you used.

## Writing the report

- **Lead with the answer**, then a short table: pool, total, used, free, % used, status.
- **Flag pools at risk:** any pool whose `status` isn't `Normal` (for example `ExceededThreshold`), and any pool over 80% used.
- **Subscription** is provisioned volume capacity ÷ pool capacity; state which figures you used. `subscriptionLimit` is the configured maximum, not the current rate.
- **Data reduction ratios** are as of their calculation time; give that time.
- **Growth and run-out dates** need history, which this API doesn't keep. Say so rather than extrapolating from one sample; suggest comparing with a later report.
- **Every number must come from a tool result** in this conversation, with the time of the check.

## Safety

These are read-only calls. Don't create, expand or change anything while reporting, even if writes are allowed.

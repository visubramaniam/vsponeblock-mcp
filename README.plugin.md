# The vsponeblock-community Claude plugin

The [`plugin/`](plugin/) folder is a Claude Code plugin, **vsponeblock-community**. It runs the vsponeblock-mcp server and adds two skills for common storage-admin tasks, so you can install everything with one command and enter your settings in Claude Code's own prompts.

> Not an official Hitachi Vantara product. See the [project README](README.md).

## Install

You need Node.js 20 or later with npm, a storage system user (for read-only use, one whose only user group is *Storage Administrator (View Only)*), and HTTPS access to the array's REST API server.

In Claude Code:

```
/plugin marketplace add visubramaniam/vsponeblock-mcp
/plugin install vsponeblock-community@vsponeblock-community
```

Claude Code asks for the storage system URL, user name and password, and the optional settings listed in [plugin/README.md](plugin/README.md#settings). The password is kept in your system's secure credential store. Claude Code then installs the server from the plugin's lockfile and starts it.

Run `/mcp` to check that the `vsponeblock` server is connected.

## Using it

Ask in plain language. For example:

- *"Is the array healthy?"* or *"Run a health check"* uses the **vsponeblock-health-check** skill: overall status of pools, snapshots and GAD pairs, recent alerts, drives, and replication pairs, in one short report.
- *"Which pools are running out of space?"* or *"Give me a capacity report"* uses the **vsponeblock-capacity-report** skill: capacity, free space, status and data-reduction ratios per pool, with units converted.
- *"Which volumes are attached to server esx01?"*, *"List the host groups on port CL1-A"*, *"Show the GAD pairs and their status"*: Claude searches the API with `vsponeblock_list_operations`, reads the operation's parameters if needed, and calls it.

Everything is read-only unless you turn on **Allow writes** in the plugin's settings. With writes on, Claude can create, expand and delete volumes, attach volumes to servers, take snapshots and more; `DELETE` operations still ask for confirmation.

## Changing settings

Run `/plugin`, choose **vsponeblock-community**, and edit its settings. Restart the session for the server to pick them up.

## Updating

`/plugin marketplace update vsponeblock-community` fetches the latest plugin version, which pins the latest server release. The plugin follows server releases: it can only pin a version that's already on npm, so it's updated in a pull request after each release.

## Troubleshooting

| Problem | Fix |
|---|---|
| The server doesn't connect | Check that `node --version` is 20 or later and `npm` is on your `PATH`, then reinstall the plugin. |
| `Session request failed (HTTP 401)` | Wrong user name or password, or the user is locked. Update the plugin's settings. |
| `maximum of 64 sessions` | Other tools are using all of the array's REST API sessions. Wait a few minutes for idle ones to time out. |
| Certificate errors | Set **CA certificate** to the PEM file of the array's CA, or turn on **Skip TLS verification** for a lab system. |

## Privacy

- The plugin sends requests only to the storage system URL you configure. Nothing is sent to the plugin's author or any third party.
- API responses become part of your conversation with Claude and are handled under your Claude account's terms. Avoid asking for more data than you need.
- Your password is stored in your system's credential store by Claude Code and is never written to logs, tool output or files by the server.
- The server stores only files you ask it to download or save, in the download folder.

## For maintainers

After each server release is on npm, update the plugin in a pull request: set the version in `plugin/package.json` (its `version` and the `vsponeblock-mcp` dependency) and in `plugin/.claude-plugin/plugin.json`, then run `npm install --package-lock-only --ignore-scripts` in `plugin/`. `tests/unit/plugin.test.mjs` checks that the three agree, that the lockfile meets the plugin directory's rules, and that the plugin isn't ahead of `package.json`.

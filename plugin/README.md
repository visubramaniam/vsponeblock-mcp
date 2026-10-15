# Hitachi VSP One Block (Community)

A community plugin that connects Claude to a **Hitachi VSP One Block** storage system through its REST API (Configuration Manager). Ask in plain language about pools and capacity, volumes, servers and their volume connections, ports, host groups, snapshots, replication pairs, alerts and drives; Claude finds the right API operation and calls it for you.

> **Not an official Hitachi Vantara product.** This plugin and the [vsponeblock-mcp](https://github.com/visubramaniam/vsponeblock-mcp) server it runs are an independent, community project, not supported by or affiliated with Hitachi Vantara. Hitachi and VSP One are trademarks of their owners.

## What's in the plugin

- **An MCP server, `vsponeblock`:** the [`vsponeblock-mcp`](https://www.npmjs.com/package/vsponeblock-mcp) npm package, pinned to an exact version. It gives Claude access to 425 operations of the VSP One Block REST API (microcode 10.5.4) through three discovery tools (`vsponeblock_list_operations`, `vsponeblock_describe_operation`, `vsponeblock_call_operation`), plus direct tools for any API areas you choose.
- **Two skills:**
  - `vsponeblock-capacity-report`: pool and array capacity, subscription and data reduction.
  - `vsponeblock-health-check`: a quick health check of pools, snapshots, GAD pairs, alerts, drives and replication.

## Install

In Claude Code, install it from this repository's marketplace:

```
/plugin marketplace add visubramaniam/vsponeblock-mcp
/plugin install vsponeblock-community@vsponeblock-community
```

Claude Code then asks for the settings below.

## Where it works

The MCP server runs locally on your computer, so the plugin works in **Claude Code** and in **Cowork** sessions that run on your computer. Claude chat (web, desktop and mobile) doesn't run local MCP servers; for Claude Desktop chat, install the `.mcpb` extension from the project's [releases](https://github.com/visubramaniam/vsponeblock-mcp/releases) instead.

## Requirements

- **Node.js 20 or later, with npm.** Claude Code uses npm to install the server's packages from the plugin's lockfile, and Node.js runs the server.
- **A storage system user** with the roles you need. For read-only use, a user whose only user group is *Storage Administrator (View Only)*.
- **HTTPS access** from your computer to the REST API server (the SVP, or the controller for the VSP One Block 20 series).

## Settings

| Setting | Required | Notes |
|---|---|---|
| Storage system URL | yes | e.g. `https://192.0.2.10`; `/ConfigurationManager` is added for you |
| User name | yes | The storage system user |
| Password | yes | Stored in your system's secure credential store, not in a settings file |
| Direct toolsets | no | API areas to expose as direct tools, e.g. `simple/volumes,simple/pools` |
| Allow writes | no | Off by default. Leave it off unless you want Claude to change the storage system |
| CA certificate | no | PEM file of the CA that signed the array's certificate |
| Skip TLS verification | no | Lab systems with self-signed certificates only |
| Download folder | no | Defaults to `~/Downloads/vsponeblock-mcp` |
| Upload folder | no | The only folder uploads may come from |

## What it runs, sends and stores

- **Installs:** when you install or update the plugin, Claude Code installs the packages listed in `package-lock.json`: the `vsponeblock-mcp` package and its dependencies, each pinned to an exact version with an integrity hash, from the npm registry and without running any install scripts.
- **Runs:** `node ${CLAUDE_PLUGIN_ROOT}/node_modules/vsponeblock-mcp/dist/index.js`, the installed server. It downloads nothing when it starts.
- **Sends:** requests only to the storage system URL you configure. It opens a REST API session with your user name and password and sends the API requests Claude makes, then discards the session when it exits. Nothing is sent to the plugin's author or any other third party.
- **Returns to Claude:** the API responses, which become part of your conversation with Claude and are handled under your Claude account's terms.
- **Stores:** files you ask it to download or save, in the download folder. It keeps no other data.
- **Credentials:** never written to logs, tool output or files.

## Package sources

Everything the plugin installs comes from the **public npm registry** (`https://registry.npmjs.org`). No private registry, proxy, mirror or alternative package source is used.

- **What's installed:** `package-lock.json` in this folder pins `vsponeblock-mcp` and its 97 dependencies to exact versions, each with a `https://registry.npmjs.org/…` URL and a `sha512` integrity hash. None has an install script.
- **No registry configuration:** there's no `.npmrc`, `bunfig.toml` or `.yarnrc` in this folder or anywhere in the repository, and `package.json` has no `overrides`, `resolutions` or `workspaces`.
- **The files above this folder:** the repository root's `package.json` and `package-lock.json` belong to the server's own source, for building and testing it, and aren't used by the plugin's install. They also resolve only from the public npm registry.

## Safety

- **Read-only by default.** Operations that change the storage system are refused before any request is sent unless you turn on **Allow writes**. Signing in as a View Only user makes the array refuse changes too.
- **Downloads** stay in one folder and never overwrite files. **Uploads** refuse hidden files and folders.
- **TLS certificates** are verified unless you turn verification off.

See [SECURITY.md](https://github.com/visubramaniam/vsponeblock-mcp/blob/main/SECURITY.md) for the full security model, and how to report a vulnerability privately.

## Documentation and support

- Installing, configuring and using the plugin: [README.plugin.md](https://github.com/visubramaniam/vsponeblock-mcp/blob/main/README.plugin.md)
- The server itself: [README](https://github.com/visubramaniam/vsponeblock-mcp#readme) and [INSTALL.md](https://github.com/visubramaniam/vsponeblock-mcp/blob/main/INSTALL.md)
- Questions and bugs: [GitHub issues](https://github.com/visubramaniam/vsponeblock-mcp/issues)

## License

MIT. See [LICENSE](LICENSE).

# vsponeblock-mcp: Community MCP server for Hitachi VSP One Block

[![npm](https://img.shields.io/npm/v/vsponeblock-mcp)](https://www.npmjs.com/package/vsponeblock-mcp) [![Release](https://github.com/visubramaniam/vsponeblock-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/visubramaniam/vsponeblock-mcp/actions/workflows/release.yml)

An MCP server for the **Hitachi VSP One Block REST API** (Configuration Manager, microcode 10.5.4), built from the OpenAPI spec `spec/vsponeblock-10.5.4.yaml`. It gives Claude (or any other MCP client) access to 425 API operations, from both the *simple* API (`/simple/v1/...`) and the *detail* API (`/v1/objects/...`). The two session endpoints are excluded because the server manages its own session.

It is a fork of [vsp360-mcp](https://github.com/visubramaniam/vsp360-mcp), the community MCP server for VSP 360, adapted to talk to a VSP One Block storage system directly.

> Not an official Hitachi Vantara product: vsponeblock-mcp is an independent, community project, and isn't supported by or affiliated with Hitachi Vantara. Hitachi and VSP One are trademarks of their owners.

## How it exposes the API

The spec is too large to load as 425 separate tools. The server therefore always provides three discovery tools:

| Tool | Purpose |
|---|---|
| `vsponeblock_list_operations` | Lists the API areas (tags such as `simple/volumes` or `detail/ldevs`). With `tag` or `query`, lists the matching operations. |
| `vsponeblock_describe_operation` | Shows the parameters, request body and response schema for one operation. |
| `vsponeblock_call_operation` | Calls any operation by `operationId`. |

For the areas you use most, set `VSPONEBLOCK_TOOLSETS` to add **direct tools**: one tool per operation, each with a full input schema. For example:

```
VSPONEBLOCK_TOOLSETS="simple/volumes,simple/pools,simple/servers"
```

### How `vsponeblock_list_operations` finds operations

1. **BM25 ranking** orders the operations. The operationId and summary count more than the long description, storage vocabulary is mapped onto the spec's wording (*LUN* → LDEV, *host* → server and host group, *GAD* → global-active device pair), and `spec/examples.json` adds example questions for common operations.
2. **A confidence rating** (HIGH, MEDIUM or LOW) says how far to trust the top result. With HIGH confidence, the top result's parameters come with the results, so Claude can usually call it straight away.

`npm run eval` scores search against labelled requests in `tests/cases.mjs`: currently 46/48 top-1 on the tuning set and 14/20 top-1 (17/20 top-3) on a held-out set. `npm test` fails if either drops.

## Safety: read-only by default

By default only `GET` operations are allowed, plus downloading a configuration report (a `POST` that only reads). All other operations are refused, and direct tools are not created for them. These include creating, expanding and deleting volumes and pools, attaching volumes to servers, snapshots and replication pairs, users, encryption keys and the DKC power state. To allow them, set `VSPONEBLOCK_ALLOW_WRITES=true`. `DELETE` tools are marked `destructiveHint`, so Claude asks for confirmation before running them.

**Use a least-privilege storage user.** The server acts with the permissions of the user it signs in as. For read-only use, sign in as a user whose only role is *Storage Administrator (View Only)*, so the array itself refuses changes even if the server's own check were bypassed.

**Local files.** Claude chooses `save_to` and upload paths, so text it reads from the API could try to steer them. `save_to` therefore only writes inside `VSPONEBLOCK_DOWNLOAD_DIR` and never overwrites a file (set `VSPONEBLOCK_SAVE_ANYWHERE=true` to lift the folder rule). Uploads (certificates, encryption key restores) refuse hidden files and folders such as `~/.ssh` or `.env`; set `VSPONEBLOCK_UPLOAD_DIR` to allow uploads only from one folder.

## Features

- **Sessions:** Opens a REST API session with `POST /ConfigurationManager/v1/objects/sessions` using the configured user and password (HTTP Basic), then sends `Authorization: Session <token>` on every call. A session ends after `VSPONEBLOCK_SESSION_ALIVE_TIME` seconds without a request (300 by default), so one left idle for nearly that long is replaced before use, and a 401 opens a new one once. The server discards its session on exit, so it doesn't hold one of the array's 64 session slots until it times out. The two DKC power-state operations use Basic authentication, as the spec requires, and the version and storage-list reads need none.
- **Asynchronous jobs:** Detail-API changes run as jobs and return `202` with a job. Pass the header parameters `Response-Job-Status: "Completed"` and `Response-Max-Wait` (seconds) to wait for the job in the same call, or follow it up with `getJob`.
- **Downloads:** Binary responses, such as configuration reports and encryption key backups, are streamed to `VSPONEBLOCK_DOWNLOAD_DIR` and the file path is returned. Any call can also pass `save_to: "volumes.json"` (a file name or a path inside the download folder).
- **Uploads:** Multipart operations take local file paths, for example `files: {"file": "~/certs/kms.pem"}`. Files are streamed from disk.
- **TLS:** Use `VSPONEBLOCK_CA_CERT` for a private CA. Use `VSPONEBLOCK_INSECURE_TLS=true` only for lab systems with self-signed certificates, which most arrays have out of the box.
- **Compact responses:** JSON responses and `vsponeblock_describe_operation` output are returned without indentation. Responses longer than `VSPONEBLOCK_MAX_RESPONSE_CHARS` are truncated, with a note telling Claude how to narrow the request (for example with `count`, `poolId` or `startVolumeId`).

## Setup

[INSTALL.md](INSTALL.md) has the full installation and deployment guide, including Windows, CI/CD pipelines, checksums, upgrading and troubleshooting. In short:

First, create a user on the storage system for the server, with the roles your use case needs (see [Safety](#safety-read-only-by-default)). Note the address of the REST API server: the SVP, or the storage controller for the VSP One Block 20 series.

Then install the server in one of these ways. Each [GitHub release](https://github.com/visubramaniam/vsponeblock-mcp/releases) has the packages and a `SHA256SUMS` file.

| Package | Needs | Use it for |
|---|---|---|
| `vsponeblock-mcp-<version>.mcpb` | Claude Desktop | One-click install: open the file and Claude Desktop asks for the URL, user and password. |
| `vsponeblock-mcp-<version>-<platform>.tar.gz` / `.zip` | nothing | Standalone install on macOS, Linux or Windows (x64 and arm64), with Node.js bundled in. |
| npm package (`vsponeblock-mcp` on the npm registry) | Node.js 20+ | `npm install -g vsponeblock-mcp`, CI/CD pipelines. |
| Docker image | Docker | See [README.docker.md](README.docker.md). |
| Source | Node.js 22+ | Development: `npm install && npm run build`, then use `node /ABSOLUTE/PATH/TO/vsponeblock-mcp/dist/index.js` as the command. |

**Standalone.** Unpack the archive anywhere and use `bin/vsponeblock-mcp` (`bin\vsponeblock-mcp.cmd` on Windows) as the server command. You can symlink it onto your `PATH`:

```bash
tar -xzf vsponeblock-mcp-0.1.0-linux-x64.tar.gz -C /opt && ln -s /opt/vsponeblock-mcp-0.1.0-linux-x64/bin/vsponeblock-mcp /usr/local/bin/vsponeblock-mcp
```

**npm or CI/CD.** The `vsponeblock-mcp` command then starts the server:

```bash
npm install -g vsponeblock-mcp
```

The examples below use `vsponeblock-mcp` as the command; substitute the path from whichever install you chose.

### Claude Code

```bash
claude mcp add vsponeblock -e VSPONEBLOCK_URL=https://192.0.2.10 -e VSPONEBLOCK_USER=claude-ro -e VSPONEBLOCK_PASSWORD=REPLACE_ME -e "VSPONEBLOCK_TOOLSETS=simple/volumes,simple/pools" -- vsponeblock-mcp
```

### Claude Desktop

The `.mcpb` package is the easiest way. To configure it by hand instead, add this to `~/Library/Application Support/Claude/claude_desktop_config.json`. Claude Desktop does not read your shell's `PATH`, so give the command's full path:

```json
{
  "mcpServers": {
    "vsponeblock": {
      "command": "/usr/local/bin/vsponeblock-mcp",
      "env": {
        "VSPONEBLOCK_URL": "https://192.0.2.10",
        "VSPONEBLOCK_USER": "claude-ro",
        "VSPONEBLOCK_PASSWORD": "REPLACE_ME",
        "VSPONEBLOCK_TOOLSETS": "simple/volumes,simple/pools"
      }
    }
  }
}
```

To try the tools interactively, run `npm run inspect`. It opens the MCP Inspector and needs the environment variables set in your shell.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VSPONEBLOCK_URL` | *(required)* | Address of the REST API server, e.g. `https://192.0.2.10`. `/ConfigurationManager` is added unless the URL already ends with it. |
| `VSPONEBLOCK_USER` | *(required)* | Storage system user |
| `VSPONEBLOCK_PASSWORD` | *(required)* | That user's password |
| `VSPONEBLOCK_SESSION_ALIVE_TIME` | `300` | Session idle timeout to ask for, 1–300 seconds |
| `VSPONEBLOCK_ALLOW_WRITES` | `false` | Allow operations that change the storage system |
| `VSPONEBLOCK_TOOLSETS` | *(none)* | Comma-separated API areas (tags) to expose as direct tools. `all` exposes all 425, which is not recommended. |
| `VSPONEBLOCK_CA_CERT` | | PEM file of the CA that signed the storage system's certificate |
| `VSPONEBLOCK_INSECURE_TLS` | `false` | Skip TLS verification (lab use only) |
| `VSPONEBLOCK_TIMEOUT_MS` | `120000` | Request timeout; uploads are exempt |
| `VSPONEBLOCK_MAX_RESPONSE_CHARS` | `60000` | Truncation limit for text responses |
| `VSPONEBLOCK_DOWNLOAD_DIR` | `~/Downloads/vsponeblock-mcp` | Where binary downloads and `save_to` files are written |
| `VSPONEBLOCK_SAVE_ANYWHERE` | `false` | Let `save_to` write outside `VSPONEBLOCK_DOWNLOAD_DIR` |
| `VSPONEBLOCK_UPLOAD_DIR` | *(any non-hidden path)* | Only allow uploads from inside this folder |
| `VSPONEBLOCK_PATH_REWRITES` | *(none)* | Path prefixes to rewrite, as comma-separated `/from=/to` pairs, for an API served behind a gateway under another prefix |
| `VSPONEBLOCK_EXAMPLES` | bundled `spec/examples.json` | Example user questions per operation, used to rank search results. Set to an empty string to turn them off. |
| `VSPONEBLOCK_SPEC` | bundled spec | Path to a different OpenAPI file, YAML or JSON, e.g. for another microcode release |
| `VSPONEBLOCK_DECISION_LOG` | *(off)* | Path to a JSON Lines file. When set, each search, describe and call is logged locally (operation names and argument names only, never values or credentials), for improving search. |

## Known limitations

- **Remote copy operations** that also need a session on the remote storage system (the `Remote-Authorization` header) are listed but can't pass that header yet.
- **Pagination** on this API is by query parameters such as `count`, `headLdevId` or `startVolumeId`, not page links, so `all_pages` has no effect; ask Claude to page by those parameters instead.

## Tag names for `VSPONEBLOCK_TOOLSETS`

Call `vsponeblock_list_operations` with no arguments for the full list with counts. The simple API's areas are `simple/storage`, `simple/drives`, `simple/pools`, `simple/volumes`, `simple/volume-server-connections`, `simple/snapshots`, `simple/servers`, `simple/ports`, `simple/qos-groups`, `simple/health-status` and others; the detail API's are `detail/ldevs`, `detail/pools`, `detail/host-groups`, `detail/luns`, `detail/remote-mirror-copypairs`, `detail/snapshots`, `detail/users` and others.

## Building the packages

`npm run package` builds every release package into `release/`. Use `--only npm,mcpb,standalone` and `--targets linux-x64,...` to build fewer, e.g. `npm run package -- --only standalone --targets darwin-arm64`. The standalone packages bundle Node.js 24, downloaded from nodejs.org and checked against its published SHA-256 sums.

The [Release workflow](.github/workflows/release.yml) runs when a `v*` tag is pushed. It runs the tests, builds the packages and attaches them to the tag's GitHub release; if that release doesn't exist yet, it's created from the version's `CHANGELOG.md` section. It then publishes the same `.tgz` to the npm registry with [trusted publishing](https://docs.npmjs.com/trusted-publishers) (set up on npmjs.com under the package's **Settings → Trusted Publisher**, repository `visubramaniam/vsponeblock-mcp`, workflow `release.yml`); this is skipped if that version is already on npm. It pushes the `linux/amd64` and `linux/arm64` Docker image to `ghcr.io/visubramaniam/vsponeblock-mcp` using the workflow's own token, and also to Docker Hub if the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets are set.

## Updating for a new microcode release

Replace `spec/vsponeblock-10.5.4.yaml` (or point `VSPONEBLOCK_SPEC` at the new file) and restart the server. No code is generated from the spec. `npm run build` keeps a pre-parsed copy of the bundled spec in `dist/openapi-cache.json`; it's only used while the YAML file is unchanged. If the new release adds `POST` operations that only read data, add them to `READ_ONLY_POSTS` in `src/spec.ts`.

## License

The code in this repository is released under the [MIT License](LICENSE). The VSP One Block OpenAPI definition in `spec/` describes Hitachi Vantara's product API and is not covered by this license.

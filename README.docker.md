# Running vsponeblock-mcp with Docker

vsponeblock-mcp is a community MCP server for Hitachi VSP One Block. It isn't an official Hitachi Vantara product.

`vsponeblock-mcp` is also published as a container image. Running it this way means you don't need to install Node.js or build anything; all you need is Docker.

```
docker.io/subramaniamv/vsponeblock-mcp
```

The same image is also on GitHub Container Registry. Use it in place of the Docker Hub name in any command below, for example where Docker Hub's pull rate limits get in the way:

```
ghcr.io/visubramaniam/vsponeblock-mcp
```

The image runs the same server described in the [main README](README.md), with the VSP One Block 1.4 OpenAPI spec bundled in. It is built for `linux/amd64` and `linux/arm64`, so it runs natively on Intel and Apple silicon Macs, Windows (WSL 2) and Linux.

## 1. Prerequisites

- **Docker** — Docker Desktop on macOS/Windows, or Docker Engine on Linux.
- **A storage system user for the server.** Create one on the storage system and note its user name and password. Give it only the roles your use case needs: for read-only use, a user whose only user group is *Storage Administrator (View Only)*. You also need the address of the REST API server: the SVP, or the storage controller for the VSP One Block 20 series.
- **Network access** from the machine running Docker to your VSP One Block over HTTPS.

## 2. Download the image

```bash
docker pull docker.io/subramaniamv/vsponeblock-mcp:latest
```

To pin a version instead of `latest`, use a release tag, for example `:0.1.0`.

## 3. Test it from the command line

This checks that the container can sign in to VSP One Block before you connect Claude. Fill in your VSP One Block details:

```bash
docker run -i --rm -e VSPONEBLOCK_URL=https://192.0.2.10 -e VSPONEBLOCK_USER=claude-ro -e VSPONEBLOCK_PASSWORD=REPLACE_ME -e VSPONEBLOCK_INSECURE_TLS=true docker.io/subramaniamv/vsponeblock-mcp:latest
```

You should see:

```
[vsponeblock-mcp] ready: 425 operations, 0 direct tools, read-only
```

The server then waits for MCP messages on standard input. Press **Ctrl+C** to stop it. Only use `VSPONEBLOCK_INSECURE_TLS=true` if your VSP One Block has a self-signed certificate; see [TLS certificates](#tls-certificates) below.

## 4. Connect it to Claude

Claude starts the container itself, once per session, with `docker run -i --rm`. Both of these flags are required:
- `-i` keeps standard input open, which is how Claude talks to the server.
- `--rm` removes the container when the session ends.

### Claude Desktop

1. Open `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.
2. Add a `vsponeblock` entry **inside** `mcpServers`:

```json
{
  "mcpServers": {
    "vsponeblock": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "VSPONEBLOCK_URL",
        "-e", "VSPONEBLOCK_USER",
        "-e", "VSPONEBLOCK_PASSWORD",
        "-e", "VSPONEBLOCK_TOOLSETS",
        "-e", "VSPONEBLOCK_INSECURE_TLS",
        "-v", "/Users/YOU/Downloads/vsponeblock-mcp:/downloads",
        "docker.io/subramaniamv/vsponeblock-mcp:latest"
      ],
      "env": {
        "VSPONEBLOCK_URL": "https://192.0.2.10",
        "VSPONEBLOCK_USER": "claude-ro",
        "VSPONEBLOCK_PASSWORD": "REPLACE_ME",
        "VSPONEBLOCK_TOOLSETS": "simple/volumes,simple/pools,simple/health-status",
        "VSPONEBLOCK_INSECURE_TLS": "false"
      }
    }
  }
}
```

3. Quit Claude fully and reopen it. On a Mac, use **Claude → Quit Claude** from the menu bar.

The values go in `env`, and `args` only lists the variable names (`-e VSPONEBLOCK_PASSWORD` with no `=value`). Docker then copies each value from the environment Claude starts it with. This keeps the secret out of the process list, where `ps` would otherwise show it.

**If Claude reports that `docker` can't be found**, Claude Desktop isn't seeing your shell's `PATH`. Replace `"docker"` with the full path, which you can find by running `which docker`. It's usually `/usr/local/bin/docker`, or `/opt/homebrew/bin/docker` with Homebrew.

### Claude Code

```bash
claude mcp add vsponeblock -e VSPONEBLOCK_URL=https://192.0.2.10 -e VSPONEBLOCK_USER=claude-ro -e VSPONEBLOCK_PASSWORD=REPLACE_ME -e "VSPONEBLOCK_TOOLSETS=simple/volumes,simple/pools" -- docker run -i --rm -e VSPONEBLOCK_URL -e VSPONEBLOCK_USER -e VSPONEBLOCK_PASSWORD -e VSPONEBLOCK_TOOLSETS -v "$HOME/Downloads/vsponeblock-mcp:/downloads" docker.io/subramaniamv/vsponeblock-mcp:latest
```

Run `claude mcp list` to check that `vsponeblock` shows as connected.

### Check that it works

In a new conversation, ask Claude:

1. *"List the VSP One Block API areas"*. This needs no VSP One Block permissions, so it confirms the container started.
2. *"Show the free capacity of each pool"*. This confirms that sign-in and network access work.

## 5. Files: downloads, uploads and certificates

The container can only see folders you mount into it with `-v host-folder:container-folder`. When you ask Claude to work with a file, use the path **inside the container**.

| What | Mount | Path to use in requests |
|---|---|---|
| Downloads (diagnostic bundles, CSR ZIPs, billing reports, CSV exports) | `-v /Users/YOU/Downloads/vsponeblock-mcp:/downloads` | Saved to `/downloads`, which appears in the host folder |
| Uploads (KMS and server-verification certificates, encryption key restores) | `-v /Users/YOU/vsponeblock-uploads:/uploads:ro` plus `-e VSPONEBLOCK_UPLOAD_DIR=/uploads` | `/uploads/kms-client.pem` |
| Decision log (optional) | `-v /Users/YOU/vsponeblock-logs:/logs` plus `-e VSPONEBLOCK_DECISION_LOG=/logs/decisions.jsonl` | Written to `/logs`, which appears in the host folder |
| Private CA certificate | `-v /Users/YOU/certs/array-ca.pem:/certs/ca.pem:ro` plus `-e VSPONEBLOCK_CA_CERT=/certs/ca.pem` | n/a |

Create the host folders before starting Claude. If Docker creates a missing host folder itself, it may be owned by root, and the container (which runs as user `node`, UID 1000) won't be able to write to it.

On Docker Desktop for Mac and Windows, folders under your home directory are shared by default. Anything else must be added under **Settings → Resources → File sharing**.

## 6. TLS certificates

VSP One Block is often installed with a self-signed certificate. If so, the container will refuse to connect with an error like `unable to get local issuer certificate`. There are two fixes:

- **Recommended:** mount the CA certificate that signed VSP One Block's certificate and set `VSPONEBLOCK_CA_CERT`, as shown in the table above.
- **Lab systems only:** set `VSPONEBLOCK_INSECURE_TLS=true`, which turns off certificate checking.

## 7. Configuration

All the [environment variables in the main README](README.md#configuration) work in the container. Pass each one with `-e NAME` in `args` and give its value in `env`. The settings you'll use most:

| Variable | Default | Notes |
|---|---|---|
| `VSPONEBLOCK_URL` | *(required)* | `https://<svp-or-controller>` |
| `VSPONEBLOCK_USER` / `VSPONEBLOCK_PASSWORD` | *(required)* | Storage system user name and password |
| `VSPONEBLOCK_TOOLSETS` | *(none)* | API areas to expose as direct tools, comma-separated. Avoid `all`, which adds 425 tools to every conversation. |
| `VSPONEBLOCK_ALLOW_WRITES` | `false` | Set to `true` to allow operations that change VSP One Block |
| `VSPONEBLOCK_CA_CERT` | | Path *inside the container* to a CA certificate |
| `VSPONEBLOCK_INSECURE_TLS` | `false` | Skips certificate checking; use on lab systems only |
| `VSPONEBLOCK_DOWNLOAD_DIR` | `/downloads` | Already set in the image; mount a folder here. Downloads and `save_to` files are written only inside it. |
| `VSPONEBLOCK_UPLOAD_DIR` | *(any non-hidden path)* | Path *inside the container* that uploads must come from, e.g. `/uploads`. In read-only mode, uploads are refused unless it's set. |
| `VSPONEBLOCK_DECISION_LOG` | *(off)* | Path *inside the container* to a JSON Lines file recording how search results are used; mount a folder for it (see [Files](#5-files-downloads-uploads-and-certificates)) |
| `VSPONEBLOCK_DECISION_HINT` | `false` | `true` adds a learned suggested next step to search results; `ab` does so in a random half of sessions |
| `VSPONEBLOCK_SPEC` | bundled 1.4 spec | Use a different OpenAPI file (see below) |

### Using the spec of another microcode release

Mount the new file and point the server at it:

```
-v /Users/YOU/specs/vsponeblock-10.6.0.yaml:/spec/vsponeblock.yaml:ro -e VSPONEBLOCK_SPEC=/spec/vsponeblock.yaml
```

## 8. Updating

```bash
docker pull docker.io/subramaniamv/vsponeblock-mcp:latest
```

Then restart Claude. The next session starts a container from the new image.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Server doesn't appear in Claude | The JSON config is invalid, or the `vsponeblock` entry is outside `mcpServers`. Run `python3 -m json.tool` on the file to check it. |
| `docker: command not found` | Claude can't see your `PATH`. Use the full path to `docker`. |
| `Missing required environment variables` | A variable is in `env` but its `-e NAME` is missing from `args`, or the other way round. |
| `unable to get local issuer certificate` | VSP One Block has a self-signed certificate. See [TLS certificates](#tls-certificates). |
| `Session request failed (HTTP 401)` | Wrong user name or password, or the user is locked. |
| `Cannot open a session ... maximum of 64 sessions` | Other tools have used all of the array's REST API sessions. Wait a few minutes for idle sessions to time out. |
| `fetch failed` with a certificate error | The array's certificate is self-signed: set `VSPONEBLOCK_CA_CERT` to its CA, or `VSPONEBLOCK_INSECURE_TLS=true` in a lab. |
| `ENOTFOUND` / `ECONNREFUSED` | The container can't reach VSP One Block. Check DNS and firewalls from the Docker host. A VSP One Block on the Docker host itself is `https://host.docker.internal`. |
| `EACCES` when saving a download | The mounted host folder isn't writable by UID 1000. Create it yourself before starting. |
| `File not found` on upload | Use the path inside the container (`/uploads/...`), not the host path. |

To see the server's own log messages, run the test command from step 3. They go to standard error, which Claude Desktop also writes to `~/Library/Logs/Claude/mcp-server-vsponeblock.log`.

## Building the image yourself

From a clone of this repository:

```bash
docker build -t vsponeblock-mcp:local .
```

Then use `vsponeblock-mcp:local` in place of `docker.io/subramaniamv/vsponeblock-mcp:latest` in the commands above. To publish your own multi-architecture image:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t docker.io/YOUR_USER/vsponeblock-mcp:0.1.0 -t docker.io/YOUR_USER/vsponeblock-mcp:latest --push .
```

# Installing vsponeblock-mcp

vsponeblock-mcp is a community MCP server for Hitachi VSP One Block. It isn't an official Hitachi Vantara product.

This guide covers installing and deploying the server. For what the server does and every setting it takes, see the [README](README.md).

- [Before you start](#before-you-start)
- [Choose an install method](#choose-an-install-method)
- [Claude Desktop extension (.mcpb)](#claude-desktop-extension-mcpb)
- [Standalone package](#standalone-package)
- [npm package](#npm-package)
- [Docker](#docker)
- [From source](#from-source)
- [Connect it to Claude](#connect-it-to-claude)
- [CI/CD pipelines](#cicd-pipelines)
- [Check that it works](#check-that-it-works)
- [Upgrading and uninstalling](#upgrading-and-uninstalling)

## Before you start

You need:

- **A storage system user for the server.** Create one on the storage system and note its user name and password. Give it only the roles your use case needs: for read-only use, a user whose only user group is *Storage Administrator (View Only)*. You also need the address of the REST API server: the SVP, or the storage controller for the VSP One Block 20 series.
- **Network access** over HTTPS from the machine running the server to your VSP One Block.
- **The CA certificate**, if VSP One Block uses a certificate signed by a private CA. You'll set it with `VSPONEBLOCK_CA_CERT`. On lab systems with a self-signed certificate you can use `VSPONEBLOCK_INSECURE_TLS=true` instead, which turns off certificate checking.

Every method takes the same three required settings: `VSPONEBLOCK_URL`, `VSPONEBLOCK_USER` and `VSPONEBLOCK_PASSWORD`. The server is read-only until you set `VSPONEBLOCK_ALLOW_WRITES=true`.

## Choose an install method

All packages are on the [GitHub releases page](https://github.com/visubramaniam/vsponeblock-mcp/releases). The commands below use version 0.1.0; replace it with the release you want.

| Method | Needs | Best for |
|---|---|---|
| [Claude Desktop extension](#claude-desktop-extension-mcpb) | Claude Desktop | Claude Desktop users. One click, no other software. |
| [Standalone package](#standalone-package) | nothing | Servers and workstations without Node.js; Claude Code. |
| [npm package](#npm-package) | Node.js 20 or later | Machines that already have Node.js; CI/CD pipelines. Installed from the npm registry. |
| [Docker](#docker) | Docker | Isolated or containerised deployments. |
| [From source](#from-source) | Node.js 22 or later, git | Development. |

### Verify your download

Each release has a `SHA256SUMS` file. Download it into the same folder as the package, then check it.

macOS or Linux:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
```

Windows (PowerShell): compare this output with the package's line in `SHA256SUMS`:

```powershell
Get-FileHash .\vsponeblock-mcp-0.1.0-win-x64.zip -Algorithm SHA256
```

## Claude Desktop extension (.mcpb)

1. Download `vsponeblock-mcp-0.1.0.mcpb`.
2. Open it, either by double-clicking it or by dragging it onto Claude Desktop.
3. Click **Install**, then fill in the settings:
   - **Storage system URL**, **User name** and **Password** are required. Claude Desktop treats the password as sensitive and doesn't show it again.
   - **Direct toolsets**: optional API areas to expose as their own tools, e.g. `simple/volumes,simple/pools`.
   - **Allow writes**: leave off for read-only access.
   - **CA certificate** or **Skip TLS verification**, if needed (see [Before you start](#before-you-start)).
   - **Download folder**: where downloaded files are saved. The default is `~/Downloads/vsponeblock-mcp`.
   - **Upload folder**: the only folder files may be uploaded from, such as bulk-registration CSVs. In read-only mode, uploads are refused unless it's set.
4. Enable the extension.

The extension runs with the Node.js built into Claude Desktop. To change a setting later, go to **Settings → Extensions → Hitachi VSP One Block (Community)**.

## Standalone package

Each standalone package contains the server and its own Node.js runtime. Download the one for your system:

| System | Package |
|---|---|
| macOS, Apple silicon | `vsponeblock-mcp-0.1.0-darwin-arm64.tar.gz` |
| macOS, Intel | `vsponeblock-mcp-0.1.0-darwin-x64.tar.gz` |
| Linux, x64 | `vsponeblock-mcp-0.1.0-linux-x64.tar.gz` |
| Linux, arm64 | `vsponeblock-mcp-0.1.0-linux-arm64.tar.gz` |
| Windows, x64 | `vsponeblock-mcp-0.1.0-win-x64.zip` |
| Windows, arm64 | `vsponeblock-mcp-0.1.0-win-arm64.zip` |

The Linux packages need glibc 2.28 or later (RHEL/Rocky 8+, Debian 10+, Ubuntu 20.04+). On Alpine Linux, use [Docker](#docker) or the [npm package](#npm-package) instead.

### macOS and Linux

Unpack the archive. To put the command on your `PATH`, symlink it:

```bash
sudo tar -xzf vsponeblock-mcp-0.1.0-linux-x64.tar.gz -C /opt
```

```bash
sudo ln -sf /opt/vsponeblock-mcp-0.1.0-linux-x64/bin/vsponeblock-mcp /usr/local/bin/vsponeblock-mcp
```

The server command is then `/usr/local/bin/vsponeblock-mcp`. The launcher follows the symlink to find its runtime, so the archive can live anywhere.

### Windows

Unzip the archive to a folder such as `C:\Program Files\vsponeblock-mcp`. This creates a `vsponeblock-mcp-0.1.0-win-x64` folder there. The server is started by its bundled `runtime\node.exe` running `dist\index.js`:

```powershell
& "C:\Program Files\vsponeblock-mcp\vsponeblock-mcp-0.1.0-win-x64\runtime\node.exe" "C:\Program Files\vsponeblock-mcp\vsponeblock-mcp-0.1.0-win-x64\dist\index.js"
```

From a Command Prompt you can also run `bin\vsponeblock-mcp.cmd`. In MCP client configs, use `node.exe` and `index.js` as shown in [Connect it to Claude](#connect-it-to-claude), because clients often can't start `.cmd` files directly.


## npm package

The package is published on the npm registry as [`vsponeblock-mcp`](https://www.npmjs.com/package/vsponeblock-mcp). It needs Node.js 20 or later.

```bash
npm install -g vsponeblock-mcp
```

This installs the `vsponeblock-mcp` command. To find its full path, which Claude Desktop needs, run `which vsponeblock-mcp` (`where vsponeblock-mcp` on Windows). To install a specific version, add it to the name, e.g. `npm install -g vsponeblock-mcp@0.1.0`.

To run it without a global install, use `npx`. Pin the version, so a new release isn't picked up without you knowing:

```bash
npx -y vsponeblock-mcp@0.1.0
```

With `npx`, the MCP client config uses `npx` as the command and `["-y", "vsponeblock-mcp@0.1.0"]` as the arguments.

Versions published by the Release workflow carry a signed [provenance attestation](https://docs.npmjs.com/generating-provenance-statements) linking them to the GitHub commit and workflow run that built them. You can see it on the package's npm page.

**Without the npm registry.** If your machines can't reach registry.npmjs.org, every GitHub release also has the same package as a file, `vsponeblock-mcp-<version>.tgz`. Install it from its URL or from a downloaded copy:

```bash
npm install -g https://github.com/visubramaniam/vsponeblock-mcp/releases/download/v0.1.0/vsponeblock-mcp-0.1.0.tgz
```

## Docker

The image `docker.io/subramaniamv/vsponeblock-mcp` is built for `linux/amd64` and `linux/arm64`. Each release is tagged with its version, and `latest` points at the newest release. The same image is also published as `ghcr.io/visubramaniam/vsponeblock-mcp`.

```bash
docker pull docker.io/subramaniamv/vsponeblock-mcp:0.1.0
```

MCP clients start the container themselves with `docker run -i --rm`. The image is set up for this, so it doesn't run as a long-lived service. [README.docker.md](README.docker.md) covers the Claude configuration, mounting folders for downloads, uploads and certificates, and troubleshooting.

## From source

```bash
git clone https://github.com/visubramaniam/vsponeblock-mcp.git
```

```bash
cd vsponeblock-mcp && npm ci && npm run build
```

The server command is `node /ABSOLUTE/PATH/TO/vsponeblock-mcp/dist/index.js`. To build the release packages yourself, run `npm run package`; they're written to `release/`.

## Connect it to Claude

In these examples, `vsponeblock-mcp` is the server command. Replace it with the path from your install method:

| Install method | Command |
|---|---|
| Standalone, macOS/Linux | `/opt/vsponeblock-mcp-0.1.0-linux-x64/bin/vsponeblock-mcp`, or `/usr/local/bin/vsponeblock-mcp` if you made the symlink |
| Standalone, Windows | `C:\Program Files\vsponeblock-mcp\vsponeblock-mcp-0.1.0-win-x64\runtime\node.exe` with the argument `...\dist\index.js` |
| npm | the output of `which vsponeblock-mcp` |
| Source | `node` with the argument `/ABSOLUTE/PATH/TO/vsponeblock-mcp/dist/index.js` |
| Docker | see [README.docker.md](README.docker.md#4-connect-it-to-claude) |

### Claude Code

```bash
claude mcp add vsponeblock -e VSPONEBLOCK_URL=https://192.0.2.10 -e VSPONEBLOCK_USER=claude-ro -e VSPONEBLOCK_PASSWORD=REPLACE_ME -e "VSPONEBLOCK_TOOLSETS=simple/volumes,simple/pools" -- vsponeblock-mcp
```

Run `claude mcp list` to check that `vsponeblock` shows as connected.

### Claude Desktop

If you didn't use the [extension](#claude-desktop-extension-mcpb), edit the config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add a `vsponeblock` entry inside `mcpServers`. Claude Desktop doesn't read your shell's `PATH`, so use full paths.

macOS or Linux:

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

Windows, standalone package (backslashes are doubled in JSON):

```json
{
  "mcpServers": {
    "vsponeblock": {
      "command": "C:\\Program Files\\vsponeblock-mcp\\vsponeblock-mcp-0.1.0-win-x64\\runtime\\node.exe",
      "args": ["C:\\Program Files\\vsponeblock-mcp\\vsponeblock-mcp-0.1.0-win-x64\\dist\\index.js"],
      "env": {
        "VSPONEBLOCK_URL": "https://192.0.2.10",
        "VSPONEBLOCK_USER": "claude-ro",
        "VSPONEBLOCK_PASSWORD": "REPLACE_ME"
      }
    }
  }
}
```

Then quit Claude Desktop fully and reopen it. On a Mac, use **Claude → Quit Claude** from the menu bar.

### Other MCP clients

The server speaks MCP over standard input and output. Configure your client to start the server command with the environment variables above.

## CI/CD pipelines

In a pipeline, install a pinned version and pass the credentials from your CI secret store. Never put them in the repository.

This GitHub Actions example installs the server from the npm registry and writes an MCP config that an agent step, such as Claude Code with `--mcp-config vsponeblock.mcp.json`, can use. The config names only the variables; the values come from the job's environment.

```yaml
env:
  VSPONEBLOCK_VERSION: 0.1.0

steps:
  - name: Install vsponeblock-mcp
    run: npm install -g "vsponeblock-mcp@$VSPONEBLOCK_VERSION"

  - name: Write the MCP config
    run: |
      cat > vsponeblock.mcp.json <<'EOF'
      { "mcpServers": { "vsponeblock": { "command": "vsponeblock-mcp" } } }
      EOF

  - name: Run the agent step
    env:
      VSPONEBLOCK_URL: ${{ vars.VSPONEBLOCK_URL }}
      VSPONEBLOCK_USER: ${{ secrets.VSPONEBLOCK_USER }}
      VSPONEBLOCK_PASSWORD: ${{ secrets.VSPONEBLOCK_PASSWORD }}
    run: ...  # your step that uses vsponeblock.mcp.json
```

If the runner can't reach the npm registry, install the release's `.tgz` file instead, checked against the release's `SHA256SUMS`:

```bash
base=https://github.com/visubramaniam/vsponeblock-mcp/releases/download/v$VSPONEBLOCK_VERSION
curl -fsSLO "$base/vsponeblock-mcp-$VSPONEBLOCK_VERSION.tgz"
curl -fsSL "$base/SHA256SUMS" | grep " vsponeblock-mcp-$VSPONEBLOCK_VERSION.tgz$" | sha256sum -c -
npm install -g "./vsponeblock-mcp-$VSPONEBLOCK_VERSION.tgz"
```

The same steps work in other CI systems. If the runner has no Node.js, download the standalone package instead and use its `bin/vsponeblock-mcp`. If your pipeline runs jobs in containers, use the Docker image.

For automated jobs, keep the server read-only, which is the default, unless the job must change VSP One Block. If the job only needs reads, sign in as a user with only the *Storage Administrator (View Only)* role too.

## Check that it works

**From the command line.** Start the server with your settings. This example uses the standalone or npm command:

```bash
VSPONEBLOCK_URL=https://192.0.2.10 VSPONEBLOCK_USER=claude-ro VSPONEBLOCK_PASSWORD=REPLACE_ME vsponeblock-mcp
```

You should see:

```
[vsponeblock-mcp] ready: 425 operations, 0 direct tools, read-only
```

The server then waits for MCP messages. Press **Ctrl+C** to stop it. The server signs in to VSP One Block only when it makes its first request, so this step doesn't test your credentials.

**In Claude.** In a new conversation, ask:

1. *"List the VSP One Block API areas"*. This needs no VSP One Block access, so it confirms the server started.
2. *"Show the free capacity of each pool"*. This confirms that sign-in, TLS and network access work.

If something fails, the server's messages go to standard error. Claude Desktop writes them to `~/Library/Logs/Claude/mcp-server-vsponeblock.log` on macOS, or `%APPDATA%\Claude\logs\mcp-server-vsponeblock.log` on Windows. Common errors:

| Error | Cause |
|---|---|
| `Missing required environment variables` | `VSPONEBLOCK_URL`, `VSPONEBLOCK_USER` or `VSPONEBLOCK_PASSWORD` isn't set. |
| `unable to get local issuer certificate` | VSP One Block's certificate isn't trusted. Set `VSPONEBLOCK_CA_CERT` (or `VSPONEBLOCK_INSECURE_TLS=true` on lab systems). |
| `Session request failed (HTTP 401)` | Wrong user name or password, or the user is locked. |
| `Cannot open a session ... maximum of 64 sessions` | Other tools have used all of the array's REST API sessions. Wait a few minutes for idle sessions to time out. |
| `fetch failed` with a certificate error | The array's certificate is self-signed: set `VSPONEBLOCK_CA_CERT` to its CA, or `VSPONEBLOCK_INSECURE_TLS=true` in a lab. |
| `ENOTFOUND` / `ECONNREFUSED` | The machine can't reach VSP One Block. Check DNS, proxies and firewalls. |

## Upgrading and uninstalling

| Method | Upgrade | Uninstall |
|---|---|---|
| Extension | Open the new `.mcpb` file and install it over the old version. Check your settings afterwards. | **Settings → Extensions → Hitachi VSP One Block (Community) → Uninstall** |
| Standalone | Unpack the new version next to the old one, repoint the symlink or config, then delete the old folder. | Delete the folder and the symlink. |
| npm | `npm install -g vsponeblock-mcp@latest`, or update the pinned version in your `npx` config | `npm uninstall -g vsponeblock-mcp` |
| Docker | `docker pull` the new tag, and update the tag in your Claude config if you pinned one. | `docker rmi docker.io/subramaniamv/vsponeblock-mcp:<tag>` |
| Source | `git pull && npm ci && npm run build` | Delete the folder. |

After upgrading, restart Claude Desktop or start a new Claude Code session so the new version is used. Check the [CHANGELOG](CHANGELOG.md) for changes that need action, such as removed operations or renamed files.

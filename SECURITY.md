# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's **Security** tab and click **Report a vulnerability**. Don't open a public issue for a security problem.

Include the version, your configuration (with secrets removed) and steps to reproduce. Fixes are released for the latest version only.

## Security model

vsponeblock-mcp runs locally and talks MCP over standard input and output. It holds a storage system user's name and password, opens a REST API session with them, and makes HTTPS requests to one VSP One Block storage system on behalf of an MCP client, usually an AI model.

The design assumes:

- **The local user or operator is trusted.** They set the environment variables and choose what the server may do.
- **The model is semi-trusted.** It can be steered by prompt injection, for example by text in volume nicknames or other storage data it reads, so the server limits what the model can do on its own.
- **Storage system responses are untrusted input.**

The controls that follow from this:

| Control | Default | Setting |
|---|---|---|
| Only reads are allowed; `POST`, `PUT`, `PATCH` and `DELETE` operations are refused, except downloading a configuration report | on | `VSPONEBLOCK_ALLOW_WRITES=true` turns it off |
| The session endpoints are not exposed as tools, so the model can't open sessions or discard other users' sessions | always | |
| Downloads and `save_to` files are written only inside one folder and never overwrite an existing file | `~/Downloads/vsponeblock-mcp` | `VSPONEBLOCK_DOWNLOAD_DIR`, `VSPONEBLOCK_SAVE_ANYWHERE` |
| Uploads refuse hidden files and folders (`~/.ssh`, `.env`, ...), or anything outside one folder if it's set. Every upload is a write, so read-only mode refuses them all. | hidden paths refused | `VSPONEBLOCK_UPLOAD_DIR` |
| TLS certificates are verified | on | `VSPONEBLOCK_CA_CERT`, `VSPONEBLOCK_INSECURE_TLS` |
| Server-supplied links are re-homed to `VSPONEBLOCK_URL`, so the session token is never sent to another host | always | |
| The session is discarded when the server exits | always | |
| Credentials and session tokens are never written to logs, tool output or the decision log | always | |

The server's read-only mode is a guard in the server, not on the array. The safest configuration for unattended or shared use is read-only, signed in as a user whose only user group is *Storage Administrator (View Only)*, so the storage system itself refuses changes, with TLS verification on and `VSPONEBLOCK_UPLOAD_DIR` set to a dedicated folder.

## Reviews

This project is a fork of [vsp360-mcp](https://github.com/visubramaniam/vsp360-mcp), whose security review (2026-10-14) covered the shared code: the read-only gate, file handling for downloads and uploads, TLS, and packaging. The session handling in `src/client.ts` is new in vsponeblock-mcp and hasn't had an independent review yet.

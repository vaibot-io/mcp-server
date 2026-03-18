# MCP Registry Submission Guide

This document walks through publishing `@vaibot/mcp-server` to the
[Official MCP Registry](https://registry.modelcontextprotocol.io).

---

## Pre-flight checklist

Before submitting, confirm these values are correct:

| Field | Current value | Action needed |
|---|---|---|
| `mcpName` in `package.json` | `io.github.vaibot-io/mcp-server` | ✅ Update `campbelllabs` to your exact GitHub username/org |
| `repository.url` in `package.json` | `https://github.com/vaibot-io/vaibot.git` | ✅ Update to your actual repo URL |
| `name` in `server.json` | `io.github.vaibot-io/mcp-server` | ✅ Must match `mcpName` exactly |
| `repository.url` in `server.json` | `https://github.com/vaibot-io/vaibot` | ✅ Must match the public repo |
| `version` in both files | `0.1.0` | ✅ Bump before each publish |

> **GitHub auth rule:** With GitHub-based auth, `mcpName` must start with
> `io.github.<your-github-username>/`. If you use a GitHub org, replace
> `campbelllabs` with the org slug exactly as it appears on github.com.

---

## Step 1 — Build and publish to npm

```bash
cd packages/mcp-server

# Install deps + build
pnpm install
pnpm build

# Publish (scoped public package)
npm publish --access public
```

Verify: https://www.npmjs.com/package/@vaibot/mcp-server

---

## Step 2 — Install mcp-publisher

```bash
# macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# Homebrew alternative
brew install mcp-publisher

# Verify
mcp-publisher --help
```

---

## Step 3 — Authenticate with the registry

```bash
mcp-publisher login github
```

Follow the device auth flow (visit the GitHub URL shown, enter the code).

---

## Step 4 — Publish to the MCP Registry

```bash
cd packages/mcp-server
mcp-publisher publish
```

Expected output:
```
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.vaibot-io/mcp-server version 0.1.0
```

---

## Step 5 — Verify

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.vaibot-io/mcp-server"
```

---

## Version bump workflow (future releases)

1. Bump version in `packages/mcp-server/package.json` and `server.json`
2. `pnpm build` from `packages/mcp-server/`
3. `npm publish --access public`
4. `mcp-publisher publish` from `packages/mcp-server/`

---

## Common errors

| Error | Fix |
|---|---|
| "Registry validation failed for package" | Ensure `mcpName` in `package.json` matches `name` in `server.json` |
| "You do not have permission to publish this server" | `mcpName` must start with `io.github.<your-github-username>/` |
| "Invalid or expired Registry JWT token" | Re-run `mcp-publisher login github` |

---

## Notes

- The MCP Registry hosts **metadata only** — the actual package artifact lives on npm.
- The `server.json` file is the registry manifest. It is included in the npm package (`"files"` in `package.json`) so `mcp-publisher` can find it.
- For CI/CD automation, see: https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx

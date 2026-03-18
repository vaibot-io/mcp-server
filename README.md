# @vaibot/mcp-server

[![npm](https://img.shields.io/npm/v/@vaibot/mcp-server)](https://www.npmjs.com/package/@vaibot/mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.campbelllabs%2Fvaibot-blue)](https://registry.modelcontextprotocol.io)

VAIBot governance circuit-breaker as an MCP server.

Exposes 4 tools to any MCP-compatible AI agent (Claude Code, Codex, ChatGPT, OpenClaw):

| Tool | Description |
|---|---|
| `vaibot_decide` | Pre-execution risk + policy decision. Call before any risky action. |
| `vaibot_finalize` | Report actual outcome after execution. Closes the governance receipt. |
| `vaibot_receipts` | List recent governance receipts with optional filters. |
| `vaibot_approve` | Approve or deny a pending action from the dashboard or agent. |

## Quick start

```bash
VAIBOT_API_KEY=vb_live_xxx \
VAIBOT_API_BASE_URL=https://api.vaibot.io \
npx @vaibot/mcp-server
```

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vaibot": {
      "command": "npx",
      "args": ["-y", "@vaibot/mcp-server"],
      "env": {
        "VAIBOT_API_KEY": "vb_live_xxx",
        "VAIBOT_API_BASE_URL": "https://api.vaibot.io"
      }
    }
  }
}
```

## Claude Code / Codex (stdio)

```bash
# .mcp.json in your project root
{
  "mcpServers": {
    "vaibot": {
      "command": "npx",
      "args": ["-y", "@vaibot/mcp-server"],
      "env": {
        "VAIBOT_API_KEY": "vb_live_xxx"
      }
    }
  }
}
```

## OpenClaw gateway plugin (coming in Phase 6 final)

The `vaibot-guard-bridge` plugin will point `guardBaseUrl` at the MCP server endpoint instead of `localhost:39111`. Config change only — no plugin code changes needed.

## Remote URL transport (HTTP)

If your agent supports MCP over HTTP (Remote URL mode), connect directly to the VAIBot API without installing anything:

```
URL:   https://api.vaibot.io/v2/mcp
Token: Bearer <your-api-key>
```

The HTTP endpoint speaks JSON-RPC 2.0 and supports all 4 tools. Auth is the same API key as the stdio transport.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAIBOT_API_KEY` | ✅ | — | VAIBot API key (`vb_stg_xxx` or `vb_live_xxx`) |
| `VAIBOT_API_BASE_URL` | — | `https://api.vaibot.io` | API base URL |

## Governance flow

```
Agent wants to run: curl -X POST https://deploy.example.com/release

1. Agent calls vaibot_decide:
   → VAIBot: APPROVAL_REQUIRED (high risk — outbound network call)
   → Returns: run_id, content_hash

2. Human reviews in dashboard, clicks Approve

3. Agent calls vaibot_approve (or dashboard fires callback):
   → VAIBot: ✅ APPROVED

4. Agent executes the action

5. Agent calls vaibot_finalize:
   → VAIBot: receipt updated, outcome=allowed
```

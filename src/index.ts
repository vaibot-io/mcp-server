#!/usr/bin/env node
/**
 * VAIBot MCP Server
 *
 * Exposes 4 governance tools to any MCP-compatible AI agent:
 *   vaibot_decide    — pre-execution risk + policy decision
 *   vaibot_finalize  — report actual outcome after execution
 *   vaibot_receipts  — list recent governance receipts
 *   vaibot_approve   — approve or deny a pending action
 *
 * Transport: stdio (default) for Claude Code / Codex / OpenClaw
 *
 * Usage:
 *   VAIBOT_API_KEY=vb_live_xxx VAIBOT_API_BASE_URL=https://api.vaibot.io vaibot-mcp
 *
 * Or via MCP config (Claude Desktop / claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "vaibot": {
 *         "command": "npx",
 *         "args": ["-y", "@vaibot/mcp-server"],
 *         "env": {
 *           "VAIBOT_API_KEY": "vb_live_xxx",
 *           "VAIBOT_API_BASE_URL": "https://api.vaibot.io"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { z } from 'zod'

import { createClientFromEnv } from './client.js'
import {
  DecideInputSchema,
  FinalizeInputSchema,
  ReceiptsInputSchema,
  ApproveInputSchema,
  handleDecide,
  handleFinalize,
  handleReceipts,
  handleApprove,
} from './tools.js'

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'vaibot_decide',
    description:
      'Ask VAIBot whether an agent action should be allowed, requires approval, or is denied. ' +
      'Call this BEFORE executing any tool that could be risky (exec, file writes, network calls). ' +
      'Returns a run_id to use with vaibot_finalize after execution.',
    inputSchema: zodToJsonSchema(DecideInputSchema),
    handler: handleDecide,
    schema: DecideInputSchema,
  },
  {
    name: 'vaibot_finalize',
    description:
      'Report the actual outcome of an action back to VAIBot after execution. ' +
      'Always call this after a vaibot_decide allow decision to close the governance receipt.',
    inputSchema: zodToJsonSchema(FinalizeInputSchema),
    handler: handleFinalize,
    schema: FinalizeInputSchema,
  },
  {
    name: 'vaibot_receipts',
    description:
      'List recent governance receipts for the current agent. ' +
      'Use to review what actions were allowed, denied, or are pending approval.',
    inputSchema: zodToJsonSchema(ReceiptsInputSchema),
    handler: handleReceipts,
    schema: ReceiptsInputSchema,
  },
  {
    name: 'vaibot_approve',
    description:
      'Approve or deny a pending governance action. ' +
      'Use content_hash from vaibot_decide or vaibot_receipts. ' +
      'action="approve" allows the blocked action to proceed; action="deny" permanently blocks it.',
    inputSchema: zodToJsonSchema(ApproveInputSchema),
    handler: handleApprove,
    schema: ApproveInputSchema,
  },
] as const

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function main() {
  const client = createClientFromEnv()

  const server = new Server(
    {
      name: 'vaibot-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {} },
    }
  )

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const tool = TOOLS.find((t) => t.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }

    try {
      const parsed = tool.schema.parse(args ?? {})
      // Cast to handle the union of handler signatures
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = await (tool.handler as (input: any, client: any) => Promise<string>)(parsed, client)
      return { content: [{ type: 'text' as const, text }] }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      }
    }
  })

  // Stdio transport (default — works with Claude Code, Codex, OpenClaw)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Suppress all console output to stderr to keep stdio clean for MCP protocol
  // (errors go to process.stderr which is separate from stdout MCP channel)
}

main().catch((err) => {
  process.stderr.write(`[vaibot-mcp] Fatal error: ${err?.message ?? err}\n`)
  process.exit(1)
})

/**
 * tools.ts — MCP tool definitions for VAIBot governance
 *
 * 4 tools:
 *   vaibot_decide    — pre-execution risk + policy decision
 *   vaibot_finalize  — report actual outcome after execution
 *   vaibot_receipts  — list recent governance receipts
 *   vaibot_approve   — approve or deny a pending action
 */

import { z } from 'zod'
import type { VaibotApiClient } from './client.js'

// ---------------------------------------------------------------------------
// Input schemas (Zod → JSON Schema via MCP SDK)
// ---------------------------------------------------------------------------

export const DecideInputSchema = z.object({
  session_id: z.string().min(1).describe('Current agent session or conversation ID'),
  agent_id: z.string().min(1).describe('Agent identifier (e.g. "main", "claude-code", "gpt-4o")'),
  tool: z.string().min(1).describe('Name of the tool the agent wants to execute'),
  command: z.string().optional().describe('The exact command or action string (e.g. "rm -rf /tmp/export")'),
  target: z.string().optional().describe('Target URL or file path (for network/file operations)'),
  cwd: z.string().optional().describe('Working directory for the action'),
  workspace_dir: z.string().optional().describe('Root workspace boundary for path classification'),
  params: z.record(z.unknown()).optional().describe('Additional tool parameters'),
})

export type DecideInput = z.infer<typeof DecideInputSchema>

export const FinalizeInputSchema = z.object({
  run_id: z.string().min(1).describe('The run_id returned from vaibot_decide'),
  outcome: z.enum(['allowed', 'blocked', 'blocked_until_approved']).describe('What actually happened'),
  exit_code: z.number().optional().describe('Exit code if the command ran'),
  error: z.string().optional().describe('Error message if execution failed'),
  duration_ms: z.number().optional().describe('Execution duration in milliseconds'),
})

export type FinalizeInput = z.infer<typeof FinalizeInputSchema>

export const ReceiptsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum number of receipts to return'),
  decision: z.enum(['allow', 'approval_required', 'deny']).optional().describe('Filter by policy decision'),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by risk level'),
  approval_status: z.enum(['not_required', 'pending', 'approved', 'denied']).optional().describe('Filter by approval status'),
  tool: z.string().optional().describe('Filter by tool name'),
})

export type ReceiptsInput = z.infer<typeof ReceiptsInputSchema>

export const ApproveInputSchema = z.object({
  content_hash: z.string().min(1).describe('Content hash of the receipt to approve or deny (returned by vaibot_decide or vaibot_receipts)'),
  action: z.enum(['approve', 'deny']).describe('Whether to approve or deny the pending action'),
})

export type ApproveInput = z.infer<typeof ApproveInputSchema>

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleDecide(input: DecideInput, client: VaibotApiClient): Promise<string> {
  const result = await client.decide({
    session_id: input.session_id,
    agent_id: input.agent_id,
    tool: input.tool,
    params: input.params,
    workspace_dir: input.workspace_dir,
    intent: {
      command: input.command,
      target: input.target,
      cwd: input.cwd,
    },
  })

  const { decision, risk, run_id, receipt_id, content_hash } = result

  const lines: string[] = [
    `VAIBot Governance Decision`,
    ``,
    `Decision:  ${decision.decision.toUpperCase()}`,
    `Risk:      ${risk.risk.toUpperCase()}`,
    `Reason:    ${decision.reason}`,
    ``,
    `run_id:        ${run_id}`,
    `receipt_id:    ${receipt_id}`,
    `content_hash:  ${content_hash}`,
  ]

  if (decision.decision === 'deny') {
    lines.push(``, `⛔ Action is DENIED. Do not proceed.`)
  } else if (decision.decision === 'approval_required') {
    lines.push(``, `⏸ Action requires HUMAN APPROVAL. Use vaibot_approve with content_hash to resolve.`)
    lines.push(`   Run: vaibot_approve { content_hash: "${content_hash}", action: "approve" }`)
  } else {
    lines.push(``, `✅ Action is ALLOWED. Proceed, then call vaibot_finalize with run_id: "${run_id}"`)
  }

  return lines.join('\n')
}

export async function handleFinalize(input: FinalizeInput, client: VaibotApiClient): Promise<string> {
  const result = await client.finalize(input.run_id, {
    outcome: input.outcome,
    result: {
      exit_code: input.exit_code,
      error: input.error,
      duration_ms: input.duration_ms,
    },
  })

  return [
    `VAIBot Finalize Receipt`,
    ``,
    `run_id:       ${result.run_id}`,
    `outcome:      ${result.outcome}`,
    `content_hash: ${result.content_hash}`,
    ``,
    `Governance receipt updated successfully.`,
  ].join('\n')
}

export async function handleReceipts(input: ReceiptsInput, client: VaibotApiClient): Promise<string> {
  const result = await client.listReceipts({
    limit: input.limit,
    decision: input.decision,
    risk_level: input.risk_level,
    approval_status: input.approval_status,
    tool: input.tool,
  })

  if (!result.receipts || result.receipts.length === 0) {
    return 'No governance receipts found matching the filter criteria.'
  }

  const lines: string[] = [`VAIBot Governance Receipts (${result.receipts.length})`, ``]

  for (const r of result.receipts) {
    lines.push(
      `• [${r.decision.toUpperCase()}] ${r.action_summary}`,
      `  Risk: ${r.risk_level}  |  Approval: ${r.approval_status}  |  Tool: ${r.tool}`,
      `  Agent: ${r.agent_name}  |  ${r.created_at.slice(0, 19).replace('T', ' ')}`,
      `  content_hash: ${r.content_hash}`,
      ``,
    )
  }

  return lines.join('\n').trim()
}

export async function handleApprove(input: ApproveInput, client: VaibotApiClient): Promise<string> {
  const result = input.action === 'approve'
    ? await client.approve(input.content_hash)
    : await client.deny(input.content_hash)

  const emoji = input.action === 'approve' ? '✅' : '⛔'
  const verb = input.action === 'approve' ? 'APPROVED' : 'DENIED'

  return [
    `${emoji} Action ${verb}`,
    ``,
    `content_hash:    ${result.content_hash}`,
    `approval_status: ${result.approval_status}`,
    `outcome:         ${result.outcome}`,
    `summary:         ${result.outcome_summary}`,
  ].join('\n')
}

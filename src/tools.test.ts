import { describe, expect, test, vi } from 'vitest'
import type { VaibotApiClient } from './client.js'
import { handleDecide, handleFinalize, handleReceipts, handleApprove } from './tools.js'

function mockClient(overrides: Partial<VaibotApiClient> = {}): VaibotApiClient {
  return {
    decide: vi.fn().mockResolvedValue({
      ok: true,
      run_id: 'run_test123',
      risk: { risk: 'high', reason: 'Outbound network call' },
      decision: { decision: 'approval_required', reason: 'High-risk action requires human approval: Outbound network call' },
      receipt_id: 'grcpt_test123',
      content_hash: 'sha256:abc123',
    }),
    finalize: vi.fn().mockResolvedValue({
      ok: true,
      run_id: 'run_test123',
      outcome: 'allowed',
      content_hash: 'sha256:abc123',
    }),
    listReceipts: vi.fn().mockResolvedValue({
      ok: true,
      receipts: [
        {
          content_hash: 'sha256:abc123',
          created_at: '2026-03-17T12:00:00.000Z',
          agent_name: 'main',
          tool: 'exec',
          action_summary: 'Attempted deploy webhook',
          risk_level: 'high',
          decision: 'approval_required',
          approval_status: 'pending',
          outcome: 'blocked_until_approved',
        },
      ],
    }),
    approve: vi.fn().mockResolvedValue({
      ok: true,
      content_hash: 'sha256:abc123',
      approval_status: 'approved',
      outcome: 'approved_and_replayed',
      outcome_summary: 'Action approved by reviewer and queued for replay.',
    }),
    deny: vi.fn().mockResolvedValue({
      ok: true,
      content_hash: 'sha256:abc123',
      approval_status: 'denied',
      outcome: 'denied_by_reviewer',
      outcome_summary: 'Action denied by reviewer. No execution performed.',
    }),
    health: vi.fn().mockResolvedValue({ ok: true, version: '2.1.0', timestamp: '2026-03-17T12:00:00.000Z' }),
    ...overrides,
  } as unknown as VaibotApiClient
}

describe('vaibot_decide', () => {
  test('returns APPROVAL_REQUIRED output for high-risk action', async () => {
    const client = mockClient()
    const result = await handleDecide({
      session_id: 'sess-123',
      agent_id: 'main',
      tool: 'exec',
      command: 'curl -X POST https://deploy.example.com/release',
    }, client)

    expect(result).toContain('APPROVAL_REQUIRED')
    expect(result).toContain('run_id')
    expect(result).toContain('run_test123')
    expect(result).toContain('content_hash')
    expect(result).toContain('sha256:abc123')
    expect(result).toContain('vaibot_approve')
  })

  test('returns ALLOWED output for low-risk action', async () => {
    const client = mockClient({
      decide: vi.fn().mockResolvedValue({
        ok: true,
        run_id: 'run_allow',
        risk: { risk: 'low', reason: 'Read-only operation' },
        decision: { decision: 'allow', reason: 'Action is within policy limits' },
        receipt_id: 'grcpt_allow',
        content_hash: 'sha256:def456',
      }),
    })

    const result = await handleDecide({
      session_id: 'sess-123',
      agent_id: 'main',
      tool: 'read',
      command: 'cat README.md',
    }, client)

    expect(result).toContain('ALLOW')
    expect(result).toContain('vaibot_finalize')
    expect(result).toContain('run_allow')
  })

  test('returns DENY output for critical action', async () => {
    const client = mockClient({
      decide: vi.fn().mockResolvedValue({
        ok: true,
        run_id: 'run_deny',
        risk: { risk: 'critical', reason: 'Destructive command' },
        decision: { decision: 'deny', reason: 'Critical-risk actions are denied by policy' },
        receipt_id: 'grcpt_deny',
        content_hash: 'sha256:fed987',
      }),
    })

    const result = await handleDecide({
      session_id: 'sess-123',
      agent_id: 'main',
      tool: 'exec',
      command: 'rm -rf /tmp/export',
    }, client)

    expect(result).toContain('DENY')
    expect(result).toContain('Do not proceed')
  })
})

describe('vaibot_finalize', () => {
  test('returns receipt confirmation', async () => {
    const client = mockClient()
    const result = await handleFinalize({
      run_id: 'run_test123',
      outcome: 'allowed',
      exit_code: 0,
      duration_ms: 450,
    }, client)

    expect(result).toContain('Finalize Receipt')
    expect(result).toContain('run_test123')
    expect(result).toContain('allowed')
    expect(result).toContain('sha256:abc123')
  })
})

describe('vaibot_receipts', () => {
  test('lists receipts with summary', async () => {
    const client = mockClient()
    const result = await handleReceipts({ limit: 10 }, client)

    expect(result).toContain('APPROVAL_REQUIRED')
    expect(result).toContain('Attempted deploy webhook')
    expect(result).toContain('sha256:abc123')
    expect(result).toContain('pending')
  })

  test('shows empty message when no receipts', async () => {
    const client = mockClient({
      listReceipts: vi.fn().mockResolvedValue({ ok: true, receipts: [] }),
    })
    const result = await handleReceipts({ limit: 10 }, client)
    expect(result).toContain('No governance receipts found')
  })
})

describe('vaibot_approve', () => {
  test('approve returns confirmed status', async () => {
    const client = mockClient()
    const result = await handleApprove({ content_hash: 'sha256:abc123', action: 'approve' }, client)
    expect(result).toContain('APPROVED')
    expect(result).toContain('approved')
    expect(result).toContain('sha256:abc123')
  })

  test('deny returns denied status', async () => {
    const client = mockClient()
    const result = await handleApprove({ content_hash: 'sha256:abc123', action: 'deny' }, client)
    expect(result).toContain('DENIED')
    expect(result).toContain('denied')
  })
})

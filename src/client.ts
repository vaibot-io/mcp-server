/**
 * client.ts — Typed HTTP client for VAIBot API v2
 *
 * Used by all MCP tool handlers to communicate with the API.
 * Auth is passed via the VAIBOT_API_KEY env var or explicit token.
 */

export type VaibotClientConfig = {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}

export type DecideRequest = {
  session_id: string
  agent_id: string
  tool: string
  params?: Record<string, unknown>
  workspace_dir?: string
  intent?: {
    command?: string
    target?: string
    cwd?: string
  }
}

export type DecideResponse = {
  ok: boolean
  run_id: string
  risk: { risk: string; reason: string }
  decision: { decision: string; reason: string }
  receipt_id: string
  content_hash: string
}

export type FinalizeRequest = {
  outcome: 'allowed' | 'blocked' | 'blocked_until_approved'
  result?: {
    exit_code?: number
    error?: string
    duration_ms?: number
  }
}

export type FinalizeResponse = {
  ok: boolean
  run_id: string
  outcome: string
  content_hash: string
}

export type ReceiptsListResponse = {
  ok: boolean
  receipts: Array<{
    content_hash: string
    created_at: string
    agent_name: string
    tool: string
    action_summary: string
    risk_level: string
    decision: string
    approval_status: string
    outcome: string
  }>
  next_cursor?: string
}

export type ApproveResponse = {
  ok: boolean
  content_hash: string
  approval_status: string
  outcome: string
  outcome_summary: string
}

export class VaibotApiClient {
  private baseUrl: string
  private apiKey: string
  private timeoutMs: number

  constructor(config: VaibotClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
    this.timeoutMs = config.timeoutMs ?? 15_000
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text || '{}') } catch { json = { ok: false, error: text.slice(0, 200) } }

    if (!res.ok) {
      const err = (json as any)?.error ?? `HTTP ${res.status}`
      throw new Error(`VAIBot API error: ${err}`)
    }
    return json as T
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text || '{}') } catch { json = { ok: false, error: text.slice(0, 200) } }

    if (!res.ok) {
      const err = (json as any)?.error ?? `HTTP ${res.status}`
      throw new Error(`VAIBot API error: ${err}`)
    }
    return json as T
  }

  private async patch<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text || '{}') } catch { json = { ok: false, error: text.slice(0, 200) } }

    if (!res.ok) {
      const err = (json as any)?.error ?? `HTTP ${res.status}`
      throw new Error(`VAIBot API error: ${err}`)
    }
    return json as T
  }

  async decide(req: DecideRequest): Promise<DecideResponse> {
    return this.post('/v2/governance/decide', req)
  }

  async finalize(runId: string, req: FinalizeRequest): Promise<FinalizeResponse> {
    return this.post(`/v2/governance/finalize/${encodeURIComponent(runId)}`, req)
  }

  async listReceipts(params?: {
    limit?: number
    decision?: string
    risk_level?: string
    approval_status?: string
    tool?: string
  }): Promise<ReceiptsListResponse> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.decision) qs.set('decision', params.decision)
    if (params?.risk_level) qs.set('risk_level', params.risk_level)
    if (params?.approval_status) qs.set('approval_status', params.approval_status)
    if (params?.tool) qs.set('tool', params.tool)

    const query = qs.toString() ? `?${qs}` : ''
    return this.get(`/v2/receipts${query}`)
  }

  async approve(contentHash: string): Promise<ApproveResponse> {
    return this.patch(`/v2/receipts/${encodeURIComponent(contentHash)}/approve`)
  }

  async deny(contentHash: string): Promise<ApproveResponse> {
    return this.patch(`/v2/receipts/${encodeURIComponent(contentHash)}/deny`)
  }

  async health(): Promise<{ ok: boolean; version: string; timestamp: string }> {
    return this.get('/v2/health')
  }
}

export function createClientFromEnv(): VaibotApiClient {
  const baseUrl = process.env.VAIBOT_API_BASE_URL ?? 'https://api.vaibot.io'
  const apiKey = process.env.VAIBOT_API_KEY ?? ''

  if (!apiKey) {
    throw new Error('VAIBOT_API_KEY environment variable is required')
  }

  return new VaibotApiClient({ baseUrl, apiKey })
}

// LabelIQ — AI provider layer (OpenAI-compatible chat/completions).
//
// Primary: Z.ai GLM vision (glm-4.6v-flash — free-tier resource-pack backed).
// Backup:  NVIDIA NIM (integrate.api.nvidia.com), same wire format.
//
// Both go through the shared retry engine (src/lib/ai/retry.ts):
//   - GLM:  up to 15 attempts, exponential backoff + full jitter
//   - NIM:  up to 5 attempts (backup provider, fails fast to the caller)
// A 429 is retried ONLY when it is a true rate limit; "insufficient balance /
// no resource package / quota exhausted" 429s are fatal (retrying can never
// succeed and would burn the function's time budget).

import { withRetry, type AttemptError, type RetryPolicy } from './retry'

export type ProviderId = 'zai' | 'nim'

export interface ProviderConfig {
  id: ProviderId
  label: string
  baseUrl: string
  apiKey: string
  model: string
  retry: RetryPolicy
  /** provider-specific request body extensions (e.g. Z.ai thinking toggle) */
  extraBody?: Record<string, unknown>
}

/** Providers currently usable from env. Order = failover order. */
export function activeProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = []

  const zaiKey = process.env.ZAI_API_KEY?.trim()
  const zaiModel = process.env.ZAI_MODEL?.trim() || 'glm-4.6v-flash'
  if (zaiKey) {
    out.push({
      id: 'zai',
      label: 'Z.ai GLM',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      apiKey: zaiKey,
      model: zaiModel,
      // GLM-4.x flash models are reasoning models by default: with thinking on,
      // reasoning_content can consume the whole completion budget and leave
      // `content` empty. Structured extraction doesn't need it — disable.
      extraBody: { thinking: { type: 'disabled' } },
      retry: { maxAttempts: 15, baseDelayMs: 400, maxDelayMs: 6000, deadlineMs: 45_000 },
    })
  }

  const nimKey = process.env.NIM_API_KEY?.trim()
  const nimModel = process.env.NIM_MODEL?.trim()
  if (nimKey && nimModel) {
    out.push({
      id: 'nim',
      label: 'NVIDIA NIM',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: nimKey,
      model: nimModel,
      retry: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 5000, deadlineMs: 20_000 },
    })
  }

  return out
}

// ---------- wire types (OpenAI-compatible subset) ----------

export type TextPart = { type: 'text'; text: string }
export type ImagePart = { type: 'image_url'; image_url: { url: string } }
export type ContentPart = TextPart | ImagePart

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ChatUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface ChatResult {
  content: string
  usage: ChatUsage | null
}

// ---------- error shaping ----------

export class HttpCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'HttpCallError'
  }
}

const FATAL_STATUS = new Set([400, 401, 403, 404, 405, 413, 422])
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

const BILLING_HINTS = [
  'insufficient balance',
  'no resource package',
  'quota',
  'exceeded your current quota',
  'billing',
  'recharge',
  'payment required',
]

/** classify an error thrown by `callProvider` */
export function classifyError(err: unknown): AttemptError {
  if (err instanceof HttpCallError) {
    const body = (err.body || '').toLowerCase()

    // 429 that is actually an exhausted account — retrying never helps
    if (err.status === 429 && BILLING_HINTS.some((h) => body.includes(h))) {
      return { retryable: false, status: 429, kind: 'billing', message: err.message }
    }
    if (err.status === 429) {
      return {
        retryable: true,
        status: 429,
        kind: 'rate_limit',
        message: err.message,
        retryAfterMs: err.retryAfterMs,
      }
    }
    if (RETRYABLE_STATUS.has(err.status)) {
      return { retryable: true, status: err.status, kind: 'server', message: err.message }
    }
    if (FATAL_STATUS.has(err.status)) {
      return { retryable: false, status: err.status, kind: 'fatal', message: err.message }
    }
    return { retryable: false, status: err.status, kind: 'http', message: err.message }
  }

  // fetch network failures / aborts / DNS — transient by nature
  const name = err instanceof Error ? err.name : String(err)
  const msg = err instanceof Error ? err.message : String(err)
  if (name === 'AbortError' || /timeout/i.test(msg) || /fetch failed/i.test(msg) || name === 'TypeError') {
    return { retryable: true, kind: 'network', message: `network: ${msg}` }
  }
  // malformed/truncated JSON response — worth one more shot
  if (name === 'SyntaxError' || /json/i.test(msg)) {
    return { retryable: true, kind: 'parse', message: `parse: ${msg}` }
  }
  return { retryable: false, kind: 'unknown', message: msg }
}

// ---------- the call ----------

export interface ChatOptions {
  maxTokens?: number
  temperature?: number
  /** per-attempt timeout (ms); default 30s */
  timeoutMs?: number
  onRetry?: (provider: ProviderConfig, attempt: number, delayMs: number, err: AttemptError) => void
}

/**
 * Single call through the provider's retry policy.
 * Throws only after the retry budget is exhausted (or a fatal error).
 */
export async function chatCompletion(
  provider: ProviderConfig,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<{ result: ChatResult; attempts: number; elapsedMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 30_000

  const outcome = await withRetry(
    provider.retry,
    classifyError,
    async () => {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          max_tokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.1,
          ...(provider.extraBody ?? {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        // Retry-After: seconds or HTTP-date — seconds is what these APIs send
        const ra = res.headers.get('retry-after')
        const raMs = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : undefined) : undefined
        throw new HttpCallError(
          `${provider.label} ${provider.model} HTTP ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          body,
          raMs,
        )
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | ContentPart[] } }>
        usage?: ChatUsage
      }
      const raw = json.choices?.[0]?.message?.content
      const content = typeof raw === 'string' ? raw : (raw ?? []).map((p) => ('text' in p ? p.text : '')).join('')
      if (!content.trim()) {
        // empty content usually means max_tokens starvation or a provider hiccup — retry
        throw new HttpCallError(`${provider.label} returned empty content`, 503, 'empty content')
      }
      return { content, usage: json.usage ?? null }
    },
    (ctx) => opts.onRetry?.(provider, ctx.attempt, ctx.delayMs, ctx.error),
  )

  if (!outcome.ok) {
    // surface the classified error to the failover loop (which tries the next provider)
    throw Object.assign(new Error(`[${outcome.error.kind}] ${outcome.error.message}`), {
      attemptError: outcome.error,
      attempts: outcome.attempts,
    })
  }
  return { result: outcome.value, attempts: outcome.attempts, elapsedMs: outcome.elapsedMs }
}

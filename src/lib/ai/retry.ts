// LabelIQ — generic retry engine with exponential backoff + full jitter,
// Retry-After support and a wall-clock deadline guard.
// Shared by all AI providers (Z.ai GLM primary, NVIDIA NIM backup).

export interface RetryPolicy {
  /** total attempts including the first one (15 => 14 retries) */
  maxAttempts: number
  /** backoff base before attempt 2 (ms) */
  baseDelayMs: number
  /** backoff cap (ms) */
  maxDelayMs: number
  /** total wall-clock budget for ALL attempts including sleeps (ms) */
  deadlineMs: number
}

/** classification of a failed attempt — produced by the caller's guard */
export interface AttemptError {
  retryable: boolean
  /** HTTP status when the error carries one */
  status?: number
  /** machine-readable kind, e.g. 'rate_limit' | 'billing' | 'server' | 'network' | 'fatal' */
  kind: string
  message: string
  /** server-provided Retry-After (ms) when present */
  retryAfterMs?: number
}

export interface RetryContext {
  /** 1-based attempt number that just failed */
  attempt: number
  /** ms to sleep before the next attempt */
  delayMs: number
  totalElapsedMs: number
  error: AttemptError
}

export interface RetrySuccess<T> {
  ok: true
  value: T
  attempts: number
  elapsedMs: number
}

export interface RetryFailure {
  ok: false
  error: AttemptError
  attempts: number
  elapsedMs: number
}

export type RetryOutcome<T> = RetrySuccess<T> | RetryFailure

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** full jitter: uniform random within [0, cap] where cap = min(maxDelay, base * 2^(attempt-1)) */
function jitterDelay(policy: RetryPolicy, attempt: number): number {
  const exp = policy.baseDelayMs * Math.pow(2, attempt - 1)
  const cap = Math.min(policy.maxDelayMs, exp)
  return Math.floor(Math.random() * cap)
}

/**
 * Run `fn` under a retry policy.
 *
 * - Retries only errors the `guard` marks retryable (429 rate-limit, 408/5xx,
 *   network/timeout). Fatal errors (auth, billing, bad request) abort at once.
 * - Honours server `Retry-After` (uses it when larger than the jittered backoff).
 * - Stops early when the wall-clock `deadlineMs` budget is exhausted, so a
 *   serverless function can never hang past its max duration.
 */
export async function withRetry<T>(
  policy: RetryPolicy,
  guard: (err: unknown) => AttemptError,
  fn: (attempt: number) => Promise<T>,
  onRetry?: (ctx: RetryContext) => void,
): Promise<RetryOutcome<T>> {
  const started = Date.now()
  let lastError: AttemptError | null = null

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const value = await fn(attempt)
      return { ok: true, value, attempts: attempt, elapsedMs: Date.now() - started }
    } catch (err) {
      lastError = guard(err)

      if (!lastError.retryable) {
        return { ok: false, error: lastError, attempts: attempt, elapsedMs: Date.now() - started }
      }

      if (attempt >= policy.maxAttempts) {
        return { ok: false, error: lastError, attempts: attempt, elapsedMs: Date.now() - started }
      }

      const elapsed = Date.now() - started
      let delay = Math.max(jitterDelay(policy, attempt), lastError.retryAfterMs ?? 0)
      // never sleep past the deadline — clamp to what remains (minus 50ms slack)
      const remaining = policy.deadlineMs - elapsed - 50
      if (remaining <= 0) {
        return { ok: false, error: lastError, attempts: attempt, elapsedMs: elapsed }
      }
      delay = Math.min(delay, remaining)

      onRetry?.({ attempt, delayMs: delay, totalElapsedMs: elapsed, error: lastError })
      await sleep(delay)
    }
  }

  return {
    ok: false,
    error: lastError ?? { retryable: false, kind: 'unknown', message: 'retry loop exhausted' },
    attempts: policy.maxAttempts,
    elapsedMs: Date.now() - started,
  }
}

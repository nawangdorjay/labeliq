// LabelIQ — AI access password gate (server-only).
//
// The VLM fallback (/api/ai/extract) can run on the SERVER's provider keys
// (Vercel env secrets) instead of the user's own BYOK keys. To stop that
// shared key from being drained by strangers, using it requires an access
// password, verified server-side:
//
//   POST /api/ai/unlock  { password }  →  { token }
//   POST /api/ai/extract with header  x-ai-token: <token>
//
// The token is HMAC-SHA256(accessPassword, fixed domain) — it proves the
// holder knew the password without ever sending the password on extraction
// calls, and it rotates automatically when the password changes. The client
// keeps it in sessionStorage, so it lives exactly as long as the browsing
// session: closing the site (tab/browser) requires the password again.
//
// BYOK calls (user's own key via x-zai-key / x-nim-key) skip the gate
// entirely — you don't need a password to spend your own key.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** domain separation for the HMAC (bump to invalidate all tokens) */
const TOKEN_DOMAIN = 'labeliq.ai-access.v1'

/**
 * The access password. Set AI_ACCESS_PASSWORD in the environment to change
 * it; when unset this falls back to the project default.
 */
export function aiAccessPassword(): string {
  const fromEnv = process.env.AI_ACCESS_PASSWORD?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : '131976'
}

/** HMAC token granted by /api/ai/unlock — hex string. */
export function aiAccessToken(): string {
  return createHmac('sha256', aiAccessPassword()).update(TOKEN_DOMAIN).digest('hex')
}

function digest(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest()
}

/** constant-time password check (compare digests so lengths are equal) */
export function checkAiPassword(candidate: string): boolean {
  return timingSafeEqual(digest(candidate), digest(aiAccessPassword()))
}

/** constant-time token check for the x-ai-token header */
export function verifyAiToken(token: string | null | undefined): boolean {
  if (!token) return false
  const a = Buffer.from(token.trim().toLowerCase(), 'utf8')
  const b = Buffer.from(aiAccessToken(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------- tiny in-memory brute-force damper ----------
// Serverless instances are short-lived, so this is best-effort — it stops
// cheap hammering on a warm instance, not a distributed attack. The real
// protection is that passwords/tokens never leave the server.

const MAX_ATTEMPTS = 10
const WINDOW_MS = 5 * 60 * 1000

const attempts = new Map<string, { count: number; resetAt: number }>()

/** record a failed unlock attempt for this client key */
export function recordFailure(key: string): void {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || rec.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  rec.count += 1
}

/** true when this client key is currently locked out */
export function isLockedOut(key: string): boolean {
  const rec = attempts.get(key)
  if (!rec) return false
  if (rec.resetAt <= Date.now()) {
    attempts.delete(key)
    return false
  }
  return rec.count >= MAX_ATTEMPTS
}

/** successful unlock clears the counter */
export function clearFailures(key: string): void {
  attempts.delete(key)
}

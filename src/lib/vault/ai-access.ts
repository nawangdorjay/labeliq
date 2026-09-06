// LabelIQ — client side of the shared-AI-key password gate.
//
// When the user has no BYOK key of their own, AI extraction runs on the
// server's provider keys. That requires the access password (default set by
// the project owner) — POST /api/ai/unlock exchanges it for a session token,
// which we keep in sessionStorage:
//
//   • survives reloads in the same tab  → "once per active session"
//   • wiped when the tab / browser closes → password needed again next visit
//
// BYOK keys (vault.ts) bypass this gate entirely.

'use client'

import { getUnlockedEntries } from './vault'

const TOKEN_KEY = 'labeliq.ai.token.v1'

/** is a BYOK key currently unlocked in memory? (then no password needed) */
export function hasByokKey(): boolean {
  const e = getUnlockedEntries()
  return !!(e?.zaiKey?.trim() || e?.nimKey?.trim())
}

/** current session token, or null (not unlocked yet / wiped) */
export function getAiToken(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAiToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* private mode etc. — session unlock just won't persist */
  }
}

export function clearAiToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** token freshly valid for this session? */
export function isAiUnlocked(): boolean {
  return !!getAiToken()
}

/**
 * Exchange the access password for a session token.
 * Returns the token, or null on wrong password / network failure (err
 * carries the server message when available).
 */
export async function unlockServerAi(
  password: string,
): Promise<{ token: string | null; error?: string }> {
  try {
    const res = await fetch('/api/ai/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (!res.ok || !json.token) {
      return { token: null, error: json.error ?? 'Unlock failed' }
    }
    setAiToken(json.token)
    return { token: json.token }
  } catch {
    return { token: null, error: 'Network error — could not reach the unlock endpoint' }
  }
}

/** headers to attach to /api/ai/extract for server-key usage */
export function aiTokenHeader(): Record<string, string> {
  const t = getAiToken()
  return t ? { 'x-ai-token': t } : {}
}

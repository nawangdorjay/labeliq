// LabelIQ — BYOK (bring-your-own-key) device vault.
//
// Stores the user's own AI provider keys (Z.ai / NVIDIA NIM) encrypted with
// AES-256-GCM, key derived from a passphrase via PBKDF2-SHA256 (150k iters).
// Nothing readable ever touches localStorage: only { salt, iv, ciphertext }.
// Keys are held in memory for the session once unlocked, and attached to
// /api/ai/extract requests as headers — the server prefers them over its
// env config for that single call and never persists them.
//
// Client-only module (uses window/Web Crypto). Guarded so importing it on
// the server during SSR is a no-op rather than a crash.

'use client'

export interface VaultEntries {
  zaiKey?: string
  zaiModel?: string
  nimKey?: string
  nimModel?: string
}

export interface VaultStatus {
  /** a saved vault exists on this device */
  exists: boolean
  /** decrypted keys are held in memory for this session */
  unlocked: boolean
  /** non-secret reminder set at save time */
  hint: string | null
  savedAt: string | null
}

const STORAGE_KEY = 'labeliq.vault.v1'

interface StoredVault {
  v: 1
  salt: string // base64
  iv: string // base64
  ct: string // base64
  hint: string
  savedAt: string
}

// ---------- base64 helpers ----------

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const subtle = (): SubtleCrypto | null => {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) return window.crypto.subtle
  } catch {
    /* not available */
  }
  return null
}

// ---------- crypto core ----------

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await subtle()!.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return subtle()!.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 150_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptVault(passphrase: string, entries: VaultEntries, hint: string): Promise<StoredVault> {
  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  window.crypto.getRandomValues(salt)
  window.crypto.getRandomValues(iv)
  const key = await deriveKey(passphrase, salt)
  const plaintext = new TextEncoder().encode(JSON.stringify(entries))
  const ct = await subtle()!.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext)
  return {
    v: 1,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(new Uint8Array(ct)),
    hint: hint.slice(0, 60),
    savedAt: new Date().toISOString(),
  }
}

async function decryptVault(passphrase: string, stored: StoredVault): Promise<VaultEntries | null> {
  try {
    const key = await deriveKey(passphrase, fromB64(stored.salt))
    const pt = await subtle()!.decrypt(
      { name: 'AES-GCM', iv: fromB64(stored.iv) as BufferSource },
      key,
      fromB64(stored.ct) as BufferSource,
    )
    return JSON.parse(new TextDecoder().decode(pt)) as VaultEntries
  } catch {
    return null // wrong passphrase (GCM auth tag mismatch) or corrupt vault
  }
}

function readStored(): StoredVault | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredVault
    if (parsed.v !== 1 || typeof parsed.ct !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

// ---------- session memory ----------

let unlockedEntries: VaultEntries | null = null

// ---------- public API ----------

export function vaultStatus(): VaultStatus {
  if (typeof window === 'undefined') return { exists: false, unlocked: false, hint: null, savedAt: null }
  const stored = readStored()
  return {
    exists: !!stored,
    unlocked: !!unlockedEntries,
    hint: stored?.hint ?? null,
    savedAt: stored?.savedAt ?? null,
  }
}

/** Encrypt and persist entries; also unlocks them for the session. */
export async function saveVault(passphrase: string, entries: VaultEntries, hint: string): Promise<boolean> {
  if (!subtle() || passphrase.length < 6) return false
  const stored = await encryptVault(passphrase, entries, hint)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  unlockedEntries = entries
  return true
}

/** Decrypt with the passphrase; keeps keys in memory for this session. */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const stored = readStored()
  if (!stored || !subtle()) return false
  const entries = await decryptVault(passphrase, stored)
  if (!entries) return false
  unlockedEntries = entries
  return true
}

/** Drop the in-memory keys (lock). The encrypted vault stays on device. */
export function lockVault(): void {
  unlockedEntries = null
}

/** Delete the encrypted vault + memory keys. */
export function wipeVault(): void {
  unlockedEntries = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Keys for the current session (null when locked / not saved). */
export function getUnlockedEntries(): VaultEntries | null {
  return unlockedEntries
}

/** Headers to attach to /api/ai/extract when BYOK keys are unlocked. */
export function byokHeaders(): Record<string, string> {
  const e = unlockedEntries
  if (!e) return {}
  const h: Record<string, string> = {}
  if (e.zaiKey?.trim()) h['x-zai-key'] = e.zaiKey.trim()
  if (e.zaiModel?.trim()) h['x-zai-model'] = e.zaiModel.trim()
  if (e.nimKey?.trim()) h['x-nim-key'] = e.nimKey.trim()
  if (e.nimModel?.trim()) h['x-nim-model'] = e.nimModel.trim()
  return h
}

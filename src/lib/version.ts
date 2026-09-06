// LabelIQ — single source of truth for the deployed version.
// Bump APP_VERSION on every deploy-worthy change so users can verify
// what's live via the header badge or GET /api/health.

export const APP_VERSION = '2.2.1'
export const BUILD_DATE = '2026-09-06'

/** feature registry surfaced in /api/health — verify claims against reality */
export const FEATURES = {
  imageCrop: 'Full-screen crop editor (drag / resize, natural-resolution cut) — mobile-safe: dynamic-viewport height, safe-area footer, Apply always reachable without scrolling',
  cameraV2: 'getUserMedia camera with torch, zoom, tap-to-focus, front/back switch, guidance frame',
  aiFallback: 'VLM label extraction — Z.ai GLM primary (15-attempt backoff) with NVIDIA NIM failover',
  aiAccessPassword: 'Shared server AI key gated by an access password — unlock once per session (POST /api/ai/unlock)',
  byok: 'Bring-your-own-key vault — API keys encrypted with AES-GCM on the device (bypasses the password gate)',
  serverlessDb: 'SQLite snapshot boot-copied to /tmp on Vercel cold start',
  multilingualOcr: 'OSD + Unicode script ratios, 9 Indic scripts, auto re-OCR',
  ruleEngine: '13 versioned rules in 3 layers (ENFORCED / INFORMATIVE), human-in-the-loop review',
} as const

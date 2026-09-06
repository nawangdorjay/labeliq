// LabelIQ — single source of truth for the deployed version.
// Bump APP_VERSION on every deploy-worthy change so users can verify
// what's live via the header badge or GET /api/health.

export const APP_VERSION = '2.1.0'
export const BUILD_DATE = '2026-09-06'

/** feature registry surfaced in /api/health — verify claims against reality */
export const FEATURES = {
  cameraV2: 'getUserMedia camera with torch, zoom, tap-to-focus, front/back switch, guidance frame',
  aiFallback: 'VLM label extraction — Z.ai GLM primary (15-attempt backoff) with NVIDIA NIM failover',
  byok: 'Bring-your-own-key vault — API keys encrypted with AES-GCM on the device',
  serverlessDb: 'SQLite snapshot boot-copied to /tmp on Vercel cold start',
  multilingualOcr: 'OSD + Unicode script ratios, 9 Indic scripts, auto re-OCR',
  ruleEngine: '13 versioned rules in 3 layers (ENFORCED / INFORMATIVE), human-in-the-loop review',
} as const

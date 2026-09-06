// LabelIQ — /api/ai/extract : VLM fallback for label field extraction.
//
// POST { imageData: dataURL, ocrText?: string }
//   → { fields: [{field, value, confidence}], provider, model, attempts, elapsedMs, usage, keySource }
//
// Provider chain: Z.ai GLM (glm-4.6v-flash, up to 15 attempts w/ backoff)
//   → NVIDIA NIM backup. 503 when every provider fails.
// Optional BYOK headers (x-zai-key / x-zai-model / x-nim-key / x-nim-model)
//   let an unlocked device vault serve the call with the user's own keys —
//   sanitized below, used for this single request, never persisted.
// Values are VERBATIM label reads — normalization + compliance decisions stay
// in the deterministic layer (see rules/extract.ts mergeVlmFields).

import { NextRequest, NextResponse } from 'next/server'
import { VlmUnavailableError, vlmExtractLabel } from '@/lib/ai/extract'
import type { ProviderOverrides } from '@/lib/ai/providers'

export const runtime = 'nodejs'
export const maxDuration = 60

/** API keys: printable ASCII, no whitespace, sane length */
function sanitizeKey(raw: string | null): string | undefined {
  if (!raw) return undefined
  const v = raw.trim()
  if (v.length < 10 || v.length > 200) return undefined
  if (!/^[\x21-\x7e]+$/.test(v)) return undefined
  return v
}

/** model ids: alphanumerics + . _ : - */
function sanitizeModel(raw: string | null): string | undefined {
  if (!raw) return undefined
  const v = raw.trim()
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(v)) return undefined
  return v
}

function readByok(req: NextRequest): ProviderOverrides {
  return {
    zaiKey: sanitizeKey(req.headers.get('x-zai-key')),
    zaiModel: sanitizeModel(req.headers.get('x-zai-model')),
    nimKey: sanitizeKey(req.headers.get('x-nim-key')),
    nimModel: sanitizeModel(req.headers.get('x-nim-model')),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const imageData = typeof body.imageData === 'string' ? body.imageData : ''
    if (!imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'imageData (dataURL) is required' }, { status: 400 })
    }
    const ocrText = typeof body.ocrText === 'string' ? body.ocrText : null

    const overrides = readByok(req)
    const result = await vlmExtractLabel(imageData, ocrText, undefined, overrides)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof VlmUnavailableError) {
      return NextResponse.json(
        { error: e.message, providerErrors: e.providerErrors },
        { status: 503 },
      )
    }
    console.error('POST /api/ai/extract failed', e)
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
  }
}

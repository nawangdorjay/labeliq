// LabelIQ — /api/ai/extract : VLM fallback for label field extraction.
//
// POST { imageData: dataURL, ocrText?: string }
//   → { fields: [{field, value, confidence}], provider, model, attempts, elapsedMs, usage }
//
// Provider chain: Z.ai GLM (glm-4.6v-flash, up to 15 attempts w/ backoff)
//   → NVIDIA NIM backup. 503 when every provider fails.
// Values are VERBATIM label reads — normalization + compliance decisions stay
// in the deterministic layer (see rules/extract.ts mergeVlmFields).

import { NextRequest, NextResponse } from 'next/server'
import { VlmUnavailableError, vlmExtractLabel } from '@/lib/ai/extract'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const imageData = typeof body.imageData === 'string' ? body.imageData : ''
    if (!imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'imageData (dataURL) is required' }, { status: 400 })
    }
    const ocrText = typeof body.ocrText === 'string' ? body.ocrText : null

    const result = await vlmExtractLabel(imageData, ocrText)
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

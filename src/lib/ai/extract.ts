// LabelIQ — VLM label extraction (the AI fallback layer).
//
// When the deterministic OCR pipeline fails to parse a field (pre-printed
// labels, glare, stylized fonts), this module asks a vision-language model to
// read the label photo directly. The VLM returns VERBATIM label text per
// field; normalization + compliance decisions still run through the SAME
// deterministic normalizers and rule engine — AI fills evidence gaps, it never
// decides compliance on its own.

import type { FieldKey } from '@/lib/types'
import {
  activeProviders,
  chatCompletion,
  type ChatMessage,
  type ContentPart,
  type ProviderConfig,
} from './providers'
import type { ChatUsage } from './providers'

/** fields the VLM may report — mirrors the deterministic pipeline's FieldKey */
const FIELD_SCHEMA: Record<FieldKey, string> = {
  MANUFACTURER: 'Manufacturer / packer / importer name AND full address (e.g. "XYZ Foods Pvt Ltd, Plot 12, Industrial Area, Mumbai 400001")',
  GENERIC_NAME: 'Generic / common name of the commodity (e.g. "Refined Sunflower Oil")',
  NET_QTY: 'Net quantity exactly as printed, with unit (e.g. "500 g", "1 L", "10 pcs")',
  MRP: 'MRP / retail sale price as printed (e.g. "₹ 120.00" or "Rs 120")',
  MFG_DATE: 'Month/year of manufacture or packaging (e.g. "JAN 2026", "01/2026") — also relative like "9 months from packing"',
  BEST_BEFORE: 'Best before / expiry / use by (e.g. "06/2027", "Best before 9 months from packaging")',
  CONSUMER_CARE: 'Consumer care contact — phone / email / toll-free as printed (e.g. "1800-123-4567")',
  ORIGIN: 'Country of origin (e.g. "India", "Product of Thailand")',
  UNIT_PRICE_HINT: 'Any per-unit pricing or tax-inclusive statement (e.g. "₹ 2.40 per g inclusive of all taxes")',
}

const SYSTEM_PROMPT = `You read photographs of pre-packaged commodity labels for Indian Legal Metrology (Packaged Commodities) Rules 2011 compliance verification.

Extract the mandatory declarations you can actually READ on the label. Return STRICT JSON only — no markdown fences, no commentary:

{"fields":[{"field":"MRP","value":"₹ 120.00","confidence":0.93},{"field":"NET_QTY","value":"500 g","confidence":0.88}]}

Rules:
- "field" MUST be one of: ${Object.keys(FIELD_SCHEMA).join(', ')}
- "value" is the VERBATIM text as printed on the label (keep currency symbols, units, spacing)
- "confidence" is 0..1 — how clearly you could read that specific declaration
- ONLY include fields that are actually visible and legible; never guess or invent values
- Ignore decorative text, barcodes, offers; read only statutory declarations
- If the label is bilingual (Hindi + English etc.), report the clearest instance`

export interface VlmField {
  field: FieldKey
  value: string
  confidence: number
}

export interface VlmExtractResult {
  fields: VlmField[]
  provider: string
  model: string
  attempts: number
  elapsedMs: number
  usage: ChatUsage | null
  /** set when the primary provider failed over to the backup */
  failoverFrom?: string
}

export class VlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly providerErrors: string[],
  ) {
    super(message)
    this.name = 'VlmUnavailableError'
  }
}

/** strip markdown fences / prose around a JSON object */
function parseJsonLoose(text: string): { fields: Array<{ field?: string; value?: unknown; confidence?: unknown }> } | null {
  const cleaned = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/, (m) => (m.includes('```') ? '' : m))
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function coerceFields(parsed: { fields: Array<{ field?: string; value?: unknown; confidence?: unknown }> } | null): VlmField[] {
  if (!parsed || !Array.isArray(parsed.fields)) return []
  const out: VlmField[] = []
  for (const f of parsed.fields) {
    if (typeof f?.field !== 'string') continue
    const key = f.field.toUpperCase().replace(/[\s-]/g, '_') as FieldKey
    if (!(key in FIELD_SCHEMA)) continue
    if (typeof f.value !== 'string' || !f.value.trim()) continue
    const conf = typeof f.confidence === 'number' ? Math.min(1, Math.max(0.3, f.confidence)) : 0.85
    out.push({ field: key, value: f.value.trim(), confidence: conf })
  }
  // dedupe by field, keep highest confidence
  const best = new Map<string, VlmField>()
  for (const f of out) {
    const prev = best.get(f.field)
    if (!prev || f.confidence > prev.confidence) best.set(f.field, f)
  }
  return [...best.values()]
}

/**
 * Ask one provider to extract fields from a label image.
 * Returns parsed fields or throws (caller failovers to the next provider).
 */
async function extractViaProvider(
  provider: ProviderConfig,
  imageDataUrl: string,
  ocrText: string | null,
): Promise<{ fields: VlmField[]; usage: ChatUsage | null; attempts: number; elapsedMs: number }> {
  const userParts: ContentPart[] = [
    { type: 'image_url', image_url: { url: imageDataUrl } },
    {
      type: 'text',
      text: ocrText?.trim()
        ? `Read this package label. The OCR pass (possibly noisy) saw:\n"""${ocrText.slice(0, 1500)}"""\nUse it as a hint, but trust what you SEE in the photo. Extract the readable declarations as JSON.`
        : 'Read this package label and extract the readable declarations as JSON.',
    },
  ]

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userParts },
  ]

  const { result, attempts, elapsedMs } = await chatCompletion(provider, messages, {
    maxTokens: 2048,
    temperature: 0.1,
    timeoutMs: 45_000,
  })

  const fields = coerceFields(parseJsonLoose(result.content))
  if (fields.length === 0) {
    throw Object.assign(new Error(`${provider.label}: model returned no usable fields`), {
      attemptError: { retryable: false, kind: 'parse', message: 'no usable fields in VLM response' },
    })
  }
  return { fields, usage: result.usage, attempts, elapsedMs }
}

/**
 * VLM label extraction with provider failover:
 * Z.ai GLM (up to 15 attempts w/ backoff) → NVIDIA NIM (backup).
 * Throws VlmUnavailableError when every provider fails.
 */
export async function vlmExtractLabel(
  imageDataUrl: string,
  ocrText: string | null,
  onRetry?: (provider: string, attempt: number, delayMs: number, err: { kind: string; message: string }) => void,
): Promise<VlmExtractResult> {
  const providers = activeProviders()
  if (providers.length === 0) {
    throw new VlmUnavailableError('No AI provider configured (set ZAI_API_KEY or NIM_API_KEY)', [])
  }

  const errors: string[] = []
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i]
    try {
      const { fields, usage, attempts, elapsedMs } = await extractViaProvider(provider, imageDataUrl, ocrText)
      return {
        fields,
        provider: provider.label,
        model: provider.model,
        attempts,
        elapsedMs,
        usage,
        failoverFrom: i > 0 ? providers[i - 1].label : undefined,
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  throw new VlmUnavailableError('All AI providers failed', errors)
}

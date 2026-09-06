// LabelIQ — deterministic, versioned rule engine
// Inputs: normalized fields + OCR geometry. Output: evidence-backed findings.
// Design principle: "AI reads the label. Rules interpret the law. The inspector makes the final call."
// The engine NEVER outsources the legal decision to an LLM.

import type { ExtractedField, FieldKey, OcrLine, RuleCheckResult } from '@/lib/types'
import { applicableRules } from './repository'

const CONF_AUTO = 0.9 // ≥ this → auto-confirmed finding; below → inspector review queue

interface EngineInput {
  fields: ExtractedField[]
  lines: OcrLine[]
  category: string
  isEcommerce: boolean
}

const field = (fields: ExtractedField[], key: FieldKey) => fields.find((f) => f.field === key)

export function runRuleEngine(input: EngineInput): {
  findings: RuleCheckResult[]
  overallConfidence: number
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING_REVIEW'
} {
  const { fields, lines, category, isEcommerce } = input
  const rules = applicableRules(category, isEcommerce)
  const findings: RuleCheckResult[] = []

  const push = (f: RuleCheckResult) => findings.push(f)

  // ---------- TEXT layer ----------
  for (const rule of rules.filter((r) => r.layer === 'TEXT' && r.status === 'ENFORCED')) {
    const fd = field(fields, rule.field as FieldKey)
    const base = {
      ruleId: rule.id,
      ruleRef: rule.ref,
      ruleTitle: rule.title,
      ruleLayer: rule.layer,
      field: rule.field,
      extractedValue: fd?.value ?? null,
      expectedFormat: rule.expectedFormat ?? null,
      evidenceBox: fd?.bbox ?? null,
      evidenceText: fd?.raw ?? null,
    }

    if (rule.id === 'R-DIGITAL-DISCLOSURE') continue // INFO-only, handled below

    if (!fd || fd.value === null) {
      push({ ...base, severity: 'MISSING', reason: `No readable declaration found for "${rule.title}" on the label. Expected: ${rule.hint}`, confidence: fd ? Math.min(fd.confidence, 0.55) : 0.35 })
      continue
    }

    // FORMAT checks
    let ok = true
    let detail = ''
    if (rule.id === 'R-NET-QTY') {
      ok = /^\d+(\.\d+)?\s*(g|kg|ml|L|pcs)$/i.test(fd.value)
      detail = ok ? `Net quantity declared as "${fd.value}" in standard units.` : `"${fd.value}" does not match a standard weight/volume/count declaration (e.g. 500 g, 1 kg, 750 ml).`
    } else if (rule.id === 'R-MRP') {
      ok = /^₹\s?\d+(\.\d{1,2})?$/.test(fd.value)
      detail = ok ? `MRP declared as ${fd.value} (parsed from "${fd.raw}").` : `"${fd.value}" is not a clean rupee amount — verify the printed price is in ₹ and inclusive of all taxes.`
    } else if (rule.id === 'R-MFG-DATE') {
      ok = /^\d{2}\/\d{4}$/.test(fd.value)
      detail = ok ? `Month & year of manufacture: ${fd.value} (MM/YYYY).` : `"${fd.value}" is not a month+year date — LMPC requires the month and year of pre-packing.`
    } else {
      const long = fd.value.trim().length >= (rule.field === 'CONSUMER_CARE' || rule.field === 'MANUFACTURER' ? 8 : 3)
      ok = long
      detail = long ? `Declaration present: "${fd.value}".` : `Extracted value "${fd.value}" is too short to be a valid ${rule.title.toLowerCase()}.`
    }

    push({
      ...base,
      severity: ok ? 'COMPLIANT' : 'VIOLATION',
      reason: ok ? detail : `${detail} Rule: ${rule.ref}.`,
      confidence: fd.confidence,
    })
  }

  // ---------- CATEGORY layer ----------
  for (const rule of rules.filter((r) => r.layer === 'CATEGORY')) {
    const fd = field(fields, rule.field as FieldKey)
    const base = {
      ruleId: rule.id,
      ruleRef: rule.ref,
      ruleTitle: rule.title,
      ruleLayer: rule.layer,
      field: rule.field,
      extractedValue: fd?.value ?? null,
      expectedFormat: rule.expectedFormat ?? null,
      evidenceBox: fd?.bbox ?? null,
      evidenceText: fd?.raw ?? null,
    }
    if (rule.status === 'INFORMATIVE') {
      push({ ...base, severity: 'WARNING', reason: `Informational (2026 package, not auto-enforced): ${rule.hint}`, confidence: 0.99 })
      continue
    }
    if (rule.check === 'INFO') {
      const present = fd?.value != null
      push({ ...base, severity: present ? 'COMPLIANT' : 'MISSING', reason: present ? `Unit-price declaration found: "${fd.value}".` : `No unit-level MRP wording detected (${rule.hint})`, confidence: fd?.confidence ?? 0.5 })
      continue
    }
    if (!fd || fd.value === null) {
      push({ ...base, severity: 'MISSING', reason: `${rule.title}: no declaration detected on this ${category} label. ${rule.hint}`, confidence: 0.4 })
    } else {
      push({ ...base, severity: 'COMPLIANT', reason: `${rule.title} declared: "${fd.value}".`, confidence: fd.confidence })
    }
  }

  // ---------- VISUAL layer (geometry proxies) ----------
  const heights = lines.map((l) => l.height).filter((h) => h > 0)
  const imgH = lines.length ? Math.max(...lines.map((l) => l.bbox.y + l.bbox.h)) : 0
  const medianH = heights.length ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 0
  const relH = imgH > 0 ? medianH / imgH : 0
  // proxy: on a standard ~90mm principal panel photographed filling the frame,
  // 1.6mm ≈ 1.8% of panel height. Threshold at 60% of that → warn.
  const heightOk = relH >= 0.011
  push({
    ruleId: 'R-VIS-LETTER-HEIGHT',
    ruleRef: 'PCR 2011 — size of letters & numerals',
    ruleTitle: 'Minimum declaration letter height (proxy)',
    ruleLayer: 'VISUAL',
    field: '-',
    severity: heightOk ? 'COMPLIANT' : 'WARNING',
    extractedValue: relH > 0 ? `${(relH * 100).toFixed(1)}% of label height` : null,
    expectedFormat: '≥ ~1.8% (≈1.6 mm on standard panel)',
    reason: heightOk
      ? 'Median text height is within the expected band for the minimum letter-height requirement (computed proxy).'
      : 'Median text height is below the proxy threshold for the 1.6 mm minimum — flag for manual measurement (photograph scale affects this proxy).',
    confidence: 0.75,
    evidenceBox: null,
    evidenceText: null,
  })

  const avgConf = lines.length ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length : 0
  const readable = avgConf >= 0.55
  push({
    ruleId: 'R-VIS-READABILITY',
    ruleRef: 'PCR 2011 — legible & prominent marking',
    ruleTitle: 'Legibility / contrast of declarations',
    ruleLayer: 'VISUAL',
    field: '-',
    severity: readable ? 'COMPLIANT' : 'WARNING',
    extractedValue: avgConf > 0 ? `mean OCR confidence ${(avgConf * 100).toFixed(0)}%` : null,
    expectedFormat: '≥ 55% mean word confidence',
    reason: readable
      ? 'OCR word confidence indicates clear, high-contrast printing.'
      : 'Low mean OCR confidence — possible low-contrast or small print; route to manual verification.',
    confidence: 0.7,
    evidenceBox: null,
    evidenceText: null,
  })

  // ---------- aggregate ----------
  const real = findings.filter((f) => f.severity !== 'WARNING')
  const confs = real.filter((f) => f.extractedValue !== null).map((f) => f.confidence)
  const overallConfidence = confs.length ? +(confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(2) : 0.5
  const violations = findings.filter((f) => f.severity === 'VIOLATION' || f.severity === 'MISSING')
  const lowConfViol = violations.some((f) => f.confidence < CONF_AUTO)
  const status = violations.length === 0 ? 'COMPLIANT' : lowConfViol ? 'PENDING_REVIEW' : 'NON_COMPLIANT'

  // per-finding triage status is assigned by the API layer
  return { findings, overallConfidence, status }
}

/** Triage: which findings go to the human review queue.
 *  Confirmations (COMPLIANT) auto-settle at a lower bar — only accusations
 *  (VIOLATION / MISSING / WARNING) need an inspector when confidence is low. */
export function findingTriage(f: RuleCheckResult): 'AUTO' | 'PENDING' {
  if (f.severity === 'COMPLIANT' && f.confidence >= 0.7) return 'AUTO'
  if (f.confidence >= CONF_AUTO) return 'AUTO'
  return 'PENDING'
}

/** Re-evaluate a single rule after an inspector edits the extracted value. */
export function revalidateFinding(
  ruleId: string,
  value: string | null,
): { severity: 'COMPLIANT' | 'VIOLATION' | 'MISSING'; reason: string } {
  if (value === null || value.trim() === '') {
    return { severity: 'MISSING', reason: 'Inspector cleared the value — declaration treated as missing.' }
  }
  const v = value.trim()
  switch (ruleId) {
    case 'R-NET-QTY': {
      const ok = /^\d+(\.\d+)?\s*(g|kg|ml|L|pcs)$/i.test(v)
      return ok
        ? { severity: 'COMPLIANT', reason: `Inspector confirmed net quantity "${v}" (standard units).` }
        : { severity: 'VIOLATION', reason: `Inspector-entered value "${v}" still fails the standard-unit format.` }
    }
    case 'R-MRP': {
      const ok = /^₹\s?\d+(\.\d{1,2})?$/.test(v) || /^(rs\.?|₹|inr)\s*\d+(\.\d{1,2})?$/i.test(v)
      return ok
        ? { severity: 'COMPLIANT', reason: `Inspector confirmed MRP "${v}" (incl. of all taxes).` }
        : { severity: 'VIOLATION', reason: `Inspector-entered value "${v}" still fails the rupee-amount format.` }
    }
    case 'R-MFG-DATE': {
      const ok = /^\d{2}\/\d{4}$/.test(v)
      return ok
        ? { severity: 'COMPLIANT', reason: `Inspector confirmed month & year of manufacture: ${v}.` }
        : { severity: 'VIOLATION', reason: `Inspector-entered value "${v}" is not a month+year (MM/YYYY).` }
    }
    default:
      return {
        severity: v.length >= 3 ? 'COMPLIANT' : 'VIOLATION',
        reason: v.length >= 3 ? `Inspector confirmed the declaration: "${v}".` : `Inspector-entered value "${v}" is too short to be valid.`,
      }
  }
}

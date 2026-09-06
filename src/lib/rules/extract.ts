// LabelIQ — field extraction & normalization
// Input: OCR lines (text + bbox + confidence). Output: normalized structured fields.
// This is the deterministic NLP layer: synonym match → regex value parse → FIELD: VALUE

import type { BBox, ExtractedField, FieldKey, OcrLine } from '@/lib/types'
import { FIELD_LABEL, matchField } from './synonyms'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const dateVal = (s: string): string | null => {
  const t = s.toLowerCase()
  // relative shelf life: "9 months from packing" / "best before 6 months"
  const rel = t.match(/\b(\d{1,2})\s*(months?|mnths)\b/)
  if (rel) return `${rel[1]} months from packing`
  // JAN 2026 / Jan-26 / January 2026
  const mon = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-/. ](\d{2,4})\b/)
  if (mon) {
    const m = MONTHS[mon[1]]
    const y = mon[2].length === 2 ? `20${mon[2]}` : mon[2]
    return `${String(m).padStart(2, '0')}/${y}`
  }
  // 01/2026, 01-2026, 2026-01, 01.2026
  const num = t.match(/\b(\d{1,2})[\/\-.](\d{2,4})\b/) ?? t.match(/\b(\d{4})[\/\-.](\d{1,2})\b/)
  if (num) {
    if (num[1].length === 4) return `${String(+num[2]).padStart(2, '0')}/${num[1]}`
    const y = num[2].length === 2 ? `20${num[2]}` : num[2]
    return `${String(+num[1]).padStart(2, '0')}/${y}`
  }
  // dd/mm/yyyy (full date counts as a date reference)
  const full = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/)
  if (full) {
    const y = full[3].length === 2 ? `20${full[3]}` : full[3]
    return `${full[2].padStart(2, '0')}/${y}`
  }
  return null
}

const mrpVal = (s: string): string | null => {
  const m = s.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i)
  if (m) return `₹ ${m[1].replace(/,/g, '')}`
  const m2 = s.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)\b/i)
  if (m2) return `₹ ${m2[1].replace(/,/g, '')}`
  return null
}

const qtyVal = (s: string): string | null => {
  const m = s.toLowerCase().match(/([\d.]+)\s*(kg|kilogram[s]?|g|gm|gram[s]?|gms|l|litre[s]?|liter[s]?|ml|pcs|pieces|nos|no\.?)\b/)
  if (!m) return null
  const units: Record<string, string> = {
    kg: 'kg', kilogram: 'kg', kilograms: 'kg', g: 'g', gm: 'g', gram: 'g', grams: 'g', gms: 'g',
    l: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L', ml: 'ml',
    pcs: 'pcs', pieces: 'pcs', nos: 'pcs', 'no.': 'pcs',
  }
  let v = m[1]
  if (v.endsWith('.') || v.startsWith('.')) v = v.replace(/\./g, '')
  return `${v} ${units[m[2]]}`
}

const originVal = (s: string): string | null => {
  const m = s.match(/(?:country of origin|origin|made in|मूल देश|उत्पत्ति का देश)\s*[:\-–]?\s*([A-Za-z]{3,}(?:\s[A-Za-z]{3,})?)/i)
  return m ? m[1].trim() : null
}

const careVal = (s: string): string | null => {
  const phone = s.match(/(1[0-9]{3}[-\s]?\d{3}[-\s]?\d{3,4}|[6-9]\d{9}|0\d{2,4}[-\s]?\d{6,8})/)
  const email = s.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
  if (phone) return phone[1]
  if (email) return email[0]
  return s.replace(/consumer care|contact|details|toll free|toll-free|उपभोक्ता/gi, '').replace(/[:\-–]/g, '').trim() || null
}

function lineValue(field: FieldKey, line: string, nextLine: string): string | null {
  switch (field) {
    case 'MRP': return mrpVal(line) ?? mrpVal(nextLine)
    case 'NET_QTY': return qtyVal(line) ?? qtyVal(nextLine)
    case 'MFG_DATE': return dateVal(line) ?? dateVal(nextLine)
    case 'BEST_BEFORE': return dateVal(line) ?? dateVal(nextLine)
    case 'ORIGIN': return originVal(line) ?? originVal(nextLine)
    case 'CONSUMER_CARE': return careVal(line) ?? careVal(nextLine)
    case 'MANUFACTURER': {
      const stripLabel = (s: string) =>
        s.replace(/^\s*(manufacturer|manufactured by|marketed by|packed by|mfd\.?|mfd\.? by|imported by|importer|marketer|address|निर्माता|पैकर|आयातक|पता)\s*[:\-–]?\s*/i, '')
      const after = stripLabel(line.replace(/.*(manufactured by|marketed by|packed by|mfd\.? by|imported by|importer|निर्माता|पैकर|आयातक)/i, '')).replace(/^[\s:\-–.]+/, '')
      const addr = (after.trim().length > 3 ? after.trim() : stripLabel(nextLine).trim()) || nextLine.trim()
      return addr.length > 3 ? addr : null
    }
    case 'GENERIC_NAME': {
      const after = line.replace(/.*(generic name|common name|name of the product|product name)/i, '').replace(/^[^A-Za-z]+/, '')
      return after.trim().length > 1 ? after.trim() : null
    }
    case 'UNIT_PRICE_HINT': return /\bper\b|\binclusive of all taxes\b/i.test(line) ? line.trim() : null
    default: return null
  }
}

const unionBox = (a: BBox | null, b: BBox | null): BBox | null =>
  !a ? b : !b ? a : {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
    h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
  }

/**
 * Extract all normalized fields from OCR lines.
 * Each field may hit several lines (bilingual labels); keep the best-confidence hit.
 */
export function extractFields(lines: OcrLine[]): ExtractedField[] {
  const best = new Map<FieldKey, ExtractedField>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.text.trim().length < 2) continue
    const hit = matchField(line.text)
    if (!hit) continue
    const nextLine = lines[i + 1]?.text ?? ''
    let value = lineValue(hit.field, line.text, nextLine)
    let bbox: BBox | null = line.bbox
    let raw = line.text
    // value may live on the next line (e.g. MRP\n₹ 120.00)
    if (value === null && lines[i + 1]) {
      value = lineValue(hit.field, nextLine, lines[i + 2]?.text ?? '')
      if (value !== null) {
        bbox = unionBox(line.bbox, lines[i + 1].bbox)
        raw = `${line.text} / ${nextLine}`
      }
    }
    const field: ExtractedField = {
      field: hit.field,
      value,
      raw,
      lineIdx: i,
      bbox,
      confidence: +line.confidence.toFixed(2),
      matchedSynonym: hit.synonym,
    }
    const prev = best.get(hit.field)
    if (!prev || (field.value !== null && (prev.value === null || field.confidence > prev.confidence))) {
      best.set(hit.field, field)
    }
  }
  return [...best.values()].sort((a, b) => a.lineIdx - b.lineIdx)
}

export { FIELD_LABEL }

/** Auto-suggest a category from free OCR text keywords. */
export function suggestCategory(text: string): { category: string; source: 'auto' | 'manual' } {
  const t = text.toLowerCase()
  const map: [string, RegExp[]][] = [
    ['Edible Oil', [/edible oil/, /soybean oil/, /sunflower oil/, /mustard oil/, /refined oil/, /तेल/]],
    ['Dairy', [/milk powder/, /paneer/, /ghee/, /dairy/, /दूध/, /घी/]],
    ['Bakery', [/biscuit/, /bread/, /cake/, /rusk/, /toast/, /केक/, /बिस्कुट/]],
    ['Beverages', [/juice/, /beverage/, /drink/, /soft drink/, /tea/, /coffee/, /नींबू/, /चाय/]],
    ['Snacks', [/namkeen/, /chips/, /snack/, /namkin/, /नमकीन/]],
    ['Packaged Food', [/instant noodle/, /noodles/, /pasta/, /atta/, /flour/, /rice/, /spice/, /masala/, /तैयार/]],
    ['Personal Care', [/soap/, /shampoo/, /toothpaste/, /cream/, /lotion/, /face wash/]],
    ['Multi-pack', [/multi pack/, /multipack/, /x ?\d+\s*(pcs|pieces|packs)/, /combo pack/]],
  ]
  for (const [cat, pats] of map) {
    if (pats.some((p) => p.test(t))) return { category: cat, source: 'auto' }
  }
  return { category: 'General', source: 'manual' }
}

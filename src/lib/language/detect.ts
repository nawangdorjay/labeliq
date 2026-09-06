// LabelIQ — automatic script / language detection
// Strategy (mirrors the pitched pipeline: detect → recognize → normalize):
//   1. OSD pass (Tesseract orientation & script detection) — glyph-shape based
//   2. Unicode script-range analysis of recognized text — ratio based
//   3. Manual override by inspector

import type { LanguageInfo } from '@/lib/types'

export interface ScriptRange {
  script: string
  label: string // language label for OCR
  lang: string | null // tesseract lang code
  ranges: [number, number][]
}

export const SCRIPT_RANGES: ScriptRange[] = [
  { script: 'Devanagari', label: 'Hindi/Marathi (Devanagari)', lang: 'hin', ranges: [[0x0900, 0x097f]] },
  { script: 'Bengali', label: 'Bengali/Assamese', lang: 'ben', ranges: [[0x0980, 0x09ff]] },
  { script: 'Gurmukhi', label: 'Punjabi (Gurmukhi)', lang: 'pan', ranges: [[0x0a00, 0x0a7f]] },
  { script: 'Gujarati', label: 'Gujarati', lang: 'guj', ranges: [[0x0a80, 0x0aff]] },
  { script: 'Oriya', label: 'Odia', lang: 'ori', ranges: [[0x0b00, 0x0b7f]] },
  { script: 'Tamil', label: 'Tamil', lang: 'tam', ranges: [[0x0b80, 0x0bff]] },
  { script: 'Telugu', label: 'Telugu', lang: 'tel', ranges: [[0x0c00, 0x0c7f]] },
  { script: 'Kannada', label: 'Kannada', lang: 'kan', ranges: [[0x0c80, 0x0cff]] },
  { script: 'Malayalam', label: 'Malayalam', lang: 'mal', ranges: [[0x0d00, 0x0d7f]] },
  { script: 'Latin', label: 'English (Latin)', lang: 'eng', ranges: [[0x0041, 0x005a], [0x0061, 0x007a], [0x00c0, 0x024f]] },
]

/** Ratio of each script family inside a text sample (0..1 of classified chars). */
export function scriptRatios(text: string): Record<string, number> {
  const counts: Record<string, number> = {}
  let total = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x20) continue // controls
    if (cp >= 0x2000 && cp <= 0x206f) continue // general punctuation
    if (cp >= 0x20a0 && cp <= 0x20cf && cp !== 0x20b9) continue // currency symbols (keep ₹)
    if (/[0-9.,:;\/\-()%\s]/.test(ch)) continue // numerals & punctuation are script-neutral
    for (const sr of SCRIPT_RANGES) {
      for (const [lo, hi] of sr.ranges) {
        if (cp >= lo && cp <= hi) {
          counts[sr.script] = (counts[sr.script] ?? 0) + 1
          total++
          break
        }
      }
    }
  }
  const ratios: Record<string, number> = {}
  if (total === 0) return { Latin: 1 }
  for (const [k, v] of Object.entries(counts)) ratios[k] = +(v / total).toFixed(3)
  return Object.fromEntries(Object.entries(ratios).sort((a, b) => b[1] - a[1]))
}

const SCRIPT_LANG: Record<string, string | null> = Object.fromEntries(
  SCRIPT_RANGES.map((s) => [s.script, s.lang]),
)
const SCRIPT_LABEL: Record<string, string> = Object.fromEntries(
  SCRIPT_RANGES.map((s) => [s.script, s.label]),
)

/** Build LanguageInfo from measured ratios (+ optional OSD hint). */
export function languageFromRatios(
  ratios: Record<string, number>,
  method: 'osd' | 'unicode' | 'manual' = 'unicode',
  osdScript?: string,
  osdConfidence = 0,
): LanguageInfo {
  const entries = Object.entries(ratios).filter(([, v]) => v >= 0.05)
  const hasIndic = entries.some(([k, v]) => k !== 'Latin' && v >= 0.12)

  let script: string
  let langs: string[]
  if (osdScript && SCRIPT_LANG[osdScript] && osdScript !== 'Latin') {
    script = osdScript
    langs = [SCRIPT_LANG[osdScript]!]
  } else {
    script = hasIndic ? entries.sort((a, b) => b[1] - a[1])[0][0] : 'Latin'
    langs = script === 'Latin' ? [] : [SCRIPT_LANG[script]!]
  }
  // Bilingual labels: add English whenever any Latin text exists
  const latinRatio = ratios.Latin ?? 0
  if (latinRatio >= 0.12 && !langs.includes('eng')) langs.push('eng')
  if (langs.length === 0) langs = ['eng']

  const parts: string[] = []
  for (const [k] of entries.sort((a, b) => b[1] - a[1])) parts.push(SCRIPT_LABEL[k] ?? k)
  const scriptLabel = parts.length ? parts.join(' + ') : 'English (Latin)'

  return {
    script,
    scriptLabel,
    ocrLangs: langs,
    ratios,
    method,
    confidence: osdScript ? +(osdConfidence / 100).toFixed(2) : Math.max(...Object.values(ratios)),
  }
}

/** Map a tesseract OSD script name to our canonical names. */
export function mapOsdScript(osd: string | null | undefined): string | undefined {
  if (!osd) return undefined
  const s = osd.toLowerCase()
  if (s.includes('devanagari')) return 'Devanagari'
  if (s.includes('bengali')) return 'Bengali'
  if (s.includes('gurmukhi') || s.includes('punjabi')) return 'Gurmukhi'
  if (s.includes('gujarati')) return 'Gujarati'
  if (s.includes('oriya') || s.includes('odia')) return 'Oriya'
  if (s.includes('tamil')) return 'Tamil'
  if (s.includes('telugu')) return 'Telugu'
  if (s.includes('kannada')) return 'Kannada'
  if (s.includes('malayalam')) return 'Malayalam'
  if (s.includes('latin') || s.includes('fraktur') || s.includes('english')) return 'Latin'
  return undefined
}

export type { LanguageInfo } from '@/lib/types'

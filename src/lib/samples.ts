// LabelIQ — demo samples: canvas-synthesized package labels + canned OCR
// Demo mode keeps the judge demo deterministic: the label image is generated in
// canvas, and the "OCR output" is injected with known ground-truth bounding boxes.
// Everything downstream (field extraction, rule engine, triage, reports) runs the
// REAL production pipeline.

import type { LanguageInfo, OcrLine } from '@/lib/types'

export interface DemoSample {
  id: string
  title: string
  story: string
  category: string
  isEcommerce: boolean
  expected: string // expected outcome blurb
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  ocr: { lines: OcrLine[]; language: LanguageInfo }
}

const F = (weight: string, px: number, family = 'Arial, Helvetica, sans-serif') =>
  `${weight} ${px}px ${family}`

const INDIC = '"Nirmala UI", "Noto Sans Devanagari", "Devanagari MT", "Mangal", sans-serif'

// canvas geometry: 760 x 980
const line = (
  y: number,
  text: string,
  x = 64,
  h = 34,
  conf = 0.93,
): OcrLine => ({
  text,
  bbox: { x, y, w: Math.min(640 - x + 64, text.length * 13), h },
  confidence: conf,
  height: h,
})

function baseLabel(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.fillStyle = '#FAF7F0'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, w, 150)
  ctx.fillStyle = '#0B1220'
  ctx.fillRect(0, h - 64, w, 64)
  ctx.fillStyle = accent
  ctx.fillRect(0, h - 68, w, 4)
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number, text: string) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = F('500', 16)
  ctx.fillText(text, 64, h - 38)
}

// ---------------------------------------------------------------- sample 1
const compliant: DemoSample = {
  id: 'noodles-compliant',
  title: 'Instant Noodles — compliant',
  story: 'XYZ Foods 500 g · MRP ₹120 — every mandatory declaration present.',
  category: 'Packaged Food',
  isEcommerce: false,
  expected: 'COMPLIANT — high-confidence auto-confirmed findings',
  draw: (ctx, w, h) => {
    baseLabel(ctx, w, h, '#0F766E')
    ctx.fillStyle = '#FFFFFF'
    ctx.font = F('800', 44)
    ctx.fillText('XYZ FOODS', 64, 74)
    ctx.font = F('600', 24)
    ctx.fillText('Instant Noodles · Masala Flavour', 64, 116)
    ctx.fillStyle = '#0B1220'
    const rows: [string, string][] = [
      ['Generic Name:', 'Instant Noodles'],
      ['Net Quantity:', '500 g'],
      ['MRP (incl. of all taxes):', '₹ 120.00'],
      ['Month & Year of Manufacture:', 'JAN 2026'],
      ['Best Before:', 'JAN 2027'],
      ['Manufactured by:', 'XYZ Foods Pvt. Ltd.'],
      ['', '12 Industrial Estate, Andheri East,'],
      ['', 'Mumbai - 400093, Maharashtra'],
      ['Consumer Care:', '1800-123-4567'],
      ['', 'care@xyzfoods.in'],
    ]
    let y = 220
    for (const [k, v] of rows) {
      ctx.font = F('600', 26)
      ctx.fillStyle = '#334155'
      ctx.fillText(k, 64, y)
      ctx.font = F('700', 28)
      ctx.fillStyle = '#0F172A'
      ctx.fillText(v, 300, y)
      y += 52
    }
    ctx.font = F('500', 18)
    ctx.fillStyle = '#64748B'
    ctx.fillText('FSSAI Lic. 10012345678901 · Batch LP-2601', 64, y + 10)
    footer(ctx, w, h, 'XYZ FOODS PVT LTD · GUARANTEED QUALITY SINCE 1998')
  },
  ocr: {
    lines: [
      line(40, 'XYZ FOODS', 64, 44, 0.96),
      line(95, 'Instant Noodles Masala Flavour', 64, 30, 0.93),
      line(210, 'Generic Name: Instant Noodles', 64, 32, 0.94),
      line(262, 'Net Quantity: 500 g', 64, 32, 0.95),
      line(314, 'MRP (incl. of all taxes): ₹ 120.00', 64, 32, 0.93),
      line(366, 'Month & Year of Manufacture: JAN 2026', 64, 32, 0.91),
      line(418, 'Best Before: JAN 2027', 64, 32, 0.92),
      line(470, 'Manufactured by: XYZ Foods Pvt. Ltd.', 64, 32, 0.92),
      line(522, '12 Industrial Estate, Andheri East,', 300, 32, 0.9),
      line(574, 'Mumbai - 400093, Maharashtra', 300, 32, 0.9),
      line(626, 'Consumer Care: 1800-123-4567', 64, 32, 0.94),
      line(678, 'care@xyzfoods.in', 300, 32, 0.93),
    ],
    language: {
      script: 'Latin',
      scriptLabel: 'English (Latin)',
      ocrLangs: ['eng'],
      ratios: { Latin: 1 },
      method: 'unicode',
      confidence: 1,
    },
  },
}

// ---------------------------------------------------------------- sample 2
const bilingualNonCompliant: DemoSample = {
  id: 'atta-hindi-violation',
  title: 'Chakki Atta — Hindi label, MRP missing',
  story: 'Bilingual Hindi/English label with NO MRP and NO consumer-care details.',
  category: 'Packaged Food',
  isEcommerce: false,
  expected: 'PENDING_REVIEW — missing declarations routed to inspector queue',
  draw: (ctx, w, h) => {
    baseLabel(ctx, w, h, '#B45309')
    ctx.fillStyle = '#FFFFFF'
    ctx.font = F('800', 42, INDIC)
    ctx.fillText('गृहिणी आटा', 64, 74)
    ctx.font = F('600', 26)
    ctx.fillText('GRIHINI ATTA · Whole Wheat Flour', 64, 116)
    ctx.fillStyle = '#0B1220'
    const rows: [string, string, boolean][] = [
      ['निवल मात्रा: 5 किलो', 'Net Quantity: 5 kg', true],
      ['निर्माण तिथि: फरवरी 2026', 'Mfg Date: FEB 2026', true],
      ['निर्माता: गृहिणी फूड्स प्रा. लि.', 'Manufacturer: Grihini Foods Pvt. Ltd.', false],
      ['पता: कानपुर, उत्तर प्रदेश - 208001', 'Address: Kanpur, Uttar Pradesh - 208001', false],
      ['बेहतर तक: अगस्त 2026', 'Best Before: AUG 2026', true],
    ]
    let y = 220
    for (const [hi, en] of rows) {
      ctx.font = F('600', 27, INDIC)
      ctx.fillStyle = '#292524'
      ctx.fillText(hi, 64, y)
      ctx.font = F('500', 20)
      ctx.fillStyle = '#78716C'
      ctx.fillText(en, 64, y + 30)
      y += 76
    }
    ctx.font = F('700', 20)
    ctx.fillStyle = '#9A3412'
    ctx.fillText('( मूल्य अंकित नहीं — MRP not printed )', 64, y + 24)
    footer(ctx, w, h, 'गृहिणी फूड्स · GRIHINI FOODS PVT LTD')
  },
  ocr: {
    lines: [
      line(40, 'गृहिणी आटा', 64, 42, 0.88),
      line(95, 'GRIHINI ATTA Whole Wheat Flour', 64, 30, 0.91),
      line(205, 'निवल मात्रा: 5 किलो', 64, 30, 0.86),
      line(238, 'Net Quantity: 5 kg', 64, 22, 0.92),
      line(281, 'निर्माण तिथि: फरवरी 2026', 64, 30, 0.83),
      line(314, 'Mfg Date: FEB 2026', 64, 22, 0.93),
      line(357, 'निर्माता: गृहिणी फूड्स प्रा. लि.', 64, 30, 0.84),
      line(390, 'Manufacturer: Grihini Foods Pvt. Ltd.', 64, 22, 0.9),
      line(433, 'पता: कानपुर, उत्तर प्रदेश - 208001', 64, 30, 0.82),
      line(466, 'Address: Kanpur, Uttar Pradesh - 208001', 64, 22, 0.89),
      line(509, 'बेहतर तक: अगस्त 2026', 64, 30, 0.85),
      line(542, 'Best Before: AUG 2026', 64, 22, 0.9),
    ],
    language: {
      script: 'Devanagari',
      scriptLabel: 'Hindi/Marathi (Devanagari) + English (Latin)',
      ocrLangs: ['hin', 'eng'],
      ratios: { Devanagari: 0.58, Latin: 0.42 },
      method: 'osd',
      confidence: 0.87,
    },
  },
}

// ---------------------------------------------------------------- sample 3
const ecommListing: DemoSample = {
  id: 'oil-ecommerce-origin',
  title: 'Sunflower Oil — e-commerce listing',
  story: 'All base declarations present + country of origin. Validated under the 2026 1st Amendment (eff. 1 Jul 2026).',
  category: 'E-commerce Listing',
  isEcommerce: true,
  expected: 'COMPLIANT — incl. 2026 origin rule (version-aware repository)',
  draw: (ctx, w, h) => {
    baseLabel(ctx, w, h, '#15803D')
    ctx.fillStyle = '#FFFFFF'
    ctx.font = F('800', 42)
    ctx.fillText('GOLDEN DROP', 64, 74)
    ctx.font = F('600', 24)
    ctx.fillText('Refined Sunflower Oil · 1 L', 64, 116)
    ctx.fillStyle = '#0B1220'
    const rows: [string, string][] = [
      ['Generic Name:', 'Refined Sunflower Oil'],
      ['Net Quantity:', '1 L'],
      ['MRP (incl. of all taxes):', '₹ 185.00'],
      ['Month & Year of Manufacture:', 'MAR 2026'],
      ['Best Before:', '9 MONTHS FROM PACKING'],
      ['Manufactured by:', 'Golden Drop Oils Ltd.'],
      ['', 'Plot 21, MIDC, Jalgaon - 425001'],
      ['Country of Origin:', 'India'],
      ['Consumer Care:', '1800-222-333'],
    ]
    let y = 220
    for (const [k, v] of rows) {
      ctx.font = F('600', 26)
      ctx.fillStyle = '#334155'
      ctx.fillText(k, 64, y)
      ctx.font = F('700', 28)
      ctx.fillStyle = '#0F172A'
      ctx.fillText(v, 320, y)
      y += 52
    }
    footer(ctx, w, h, 'GOLDEN DROP OILS · e-commerce listing card')
  },
  ocr: {
    lines: [
      line(40, 'GOLDEN DROP', 64, 44, 0.95),
      line(95, 'Refined Sunflower Oil 1 L', 64, 30, 0.93),
      line(210, 'Generic Name: Refined Sunflower Oil', 64, 32, 0.94),
      line(262, 'Net Quantity: 1 L', 64, 32, 0.94),
      line(314, 'MRP (incl. of all taxes): ₹ 185.00', 64, 32, 0.92),
      line(366, 'Month & Year of Manufacture: MAR 2026', 64, 32, 0.91),
      line(418, 'Best Before: 9 MONTHS FROM PACKING', 64, 32, 0.9),
      line(470, 'Manufactured by: Golden Drop Oils Ltd.', 64, 32, 0.92),
      line(522, 'Plot 21, MIDC, Jalgaon - 425001', 320, 32, 0.9),
      line(574, 'Country of Origin: India', 64, 32, 0.95),
      line(626, 'Consumer Care: 1800-222-333', 64, 32, 0.94),
    ],
    language: {
      script: 'Latin',
      scriptLabel: 'English (Latin)',
      ocrLangs: ['eng'],
      ratios: { Latin: 1 },
      method: 'unicode',
      confidence: 1,
    },
  },
}

export const DEMO_SAMPLES: DemoSample[] = [compliant, bilingualNonCompliant, ecommListing]

export function getSample(id: string): DemoSample | undefined {
  return DEMO_SAMPLES.find((s) => s.id === id)
}

/** Render a sample label to a dataURL. */
export function renderSampleImage(sample: DemoSample, w = 760, h = 980): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  sample.draw(ctx, w, h)
  return canvas.toDataURL('image/jpeg', 0.9)
}

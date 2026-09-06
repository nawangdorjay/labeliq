// LabelIQ — OCR pipeline with automatic language detection
// Browser side (Tesseract.js). Mirrors the pitched architecture:
//   IMAGE PREPROCESSING → OCR (+script detection) → TEXT + BOUNDING BOXES
// → FIELD NORMALIZATION (lib/rules/extract) → RULE ENGINE (lib/rules/engine)

import type { LanguageInfo, OcrLine } from '@/lib/types'
import { languageFromRatios, mapOsdScript, scriptRatios } from '@/lib/language/detect'
import type { PreprocessOptions } from './preprocess'
import { processImage } from './preprocess'

export interface OcrProgress {
  stage: 'preprocess' | 'detect' | 'recognize' | 'normalize' | 'done'
  progress: number // 0..1
  detail?: string
}

type Logger = (p: OcrProgress) => void

interface TessLike {
  recognize: (
    image: unknown,
    options?: Record<string, unknown>,
    output?: { text?: boolean; blocks?: boolean },
  ) => Promise<{ data: { text: string; blocks: unknown[] | null; confidence: number } }>
  detect: (image: unknown) => Promise<{ data: { script: string | null; script_confidence: number | null } }>
  reinitialize: (langs: string[]) => Promise<unknown>
  terminate: () => Promise<unknown>
}

let workerPromise: Promise<TessLike> | null = null

async function getWorker(): Promise<TessLike> {
  const mod = await import('tesseract.js')
  const createWorker = (mod as unknown as { createWorker: (l?: string[]) => Promise<TessLike> }).createWorker
  const w = await createWorker(['eng'])
  return w
}

async function ensureWorker(): Promise<TessLike> {
  if (!workerPromise) workerPromise = getWorker().catch((e) => { workerPromise = null; throw e })
  return workerPromise
}

interface RawLine { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }

function extractLines(blocks: unknown[] | null): { lines: RawLine[]; text: string; conf: number } {
  const lines: RawLine[] = []
  const textParts: string[] = []
  let confSum = 0
  let confN = 0
  const walkBlocks = (blocks ?? []) as Array<{ paragraphs?: Array<{ lines?: RawLine[] }>; text?: string; confidence?: number }>
  for (const b of walkBlocks) {
    if (b.confidence != null) { confSum += b.confidence; confN++ }
    if (b.text) textParts.push(b.text)
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        if (l.text && l.text.trim().length > 0) {
          lines.push(l)
          confSum += l.confidence ?? 0
          confN++
        }
      }
    }
  }
  return { lines, text: textParts.join('\n'), conf: confN ? confSum / confN : 0 }
}

export interface OcrResult {
  ocrText: string
  lines: OcrLine[]
  language: LanguageInfo
  processedDataUrl: string
  displayDataUrl: string
}

/**
 * Full OCR pass with automatic language detection:
 *  1. preprocess (OpenCV-style canvas ops)
 *  2. OSD script detection (glyph-based)
 *  3. eng pass → unicode script-ratio analysis (fallback/complement)
 *  4. re-OCR in detected script language(s) when needed
 *  5. map word/line bounding boxes for evidence
 */
export async function ocrPipeline(
  img: HTMLImageElement | HTMLCanvasElement,
  preprocess: PreprocessOptions,
  opts: { manualLangs?: string[]; onProgress?: Logger } = {},
): Promise<OcrResult> {
  const onProgress = opts.onProgress ?? (() => {})
  onProgress({ stage: 'preprocess', progress: 0.05, detail: 'Normalizing geometry, grayscale & contrast' })
  const { canvas, dataUrl, displayUrl } = processImage(img, preprocess)
  onProgress({ stage: 'preprocess', progress: 0.2, detail: `Processed to ${canvas.width}×${canvas.height}` })

  const worker = await ensureWorker()

  // --- 2. OSD script detection (best effort) ---
  let osdScript: string | undefined
  let osdConf = 0
  try {
    const { data } = await worker.detect(canvas)
    osdScript = mapOsdScript(data?.script)
    osdConf = data?.script_confidence ?? 0
    onProgress({ stage: 'detect', progress: 0.35, detail: `OSD script: ${osdScript ?? 'unresolved'} (${osdConf.toFixed(0)}%)` })
  } catch {
    onProgress({ stage: 'detect', progress: 0.35, detail: 'OSD unavailable — falling back to Unicode analysis' })
  }

  // --- 3. first recognition pass ---
  const langs = opts.manualLangs ?? (osdScript && osdScript !== 'Latin' ? ['eng'] : ['eng'])
  if (langs.join('+') !== 'eng') await worker.reinitialize(langs)
  onProgress({ stage: 'recognize', progress: 0.45, detail: `OCR pass 1: ${langs.join(' + ')}` })
  const first = await worker.recognize(canvas, {}, { text: true, blocks: true })
  let parsed = extractLines(first.data.blocks)

  // unicode analysis on pass-1 text
  const ratios = scriptRatios(first.data.text || parsed.text)
  const indic = Object.entries(ratios).find(([k, v]) => k !== 'Latin' && v >= 0.12)

  // --- 4. decide final languages ---
  let finalLangs = langs
  let method: LanguageInfo['method'] = opts.manualLangs ? 'manual' : 'unicode'
  if (!opts.manualLangs) {
    if (indic) {
      const wanted = languageFromRatios(ratios, 'unicode', osdScript, osdConf)
      finalLangs = wanted.ocrLangs
      method = osdScript === wanted.script ? 'osd' : 'unicode'
    } else if (osdScript && osdScript !== 'Latin') {
      finalLangs = [langForScript(osdScript), 'eng'].filter(Boolean) as string[]
      method = 'osd'
    } else {
      finalLangs = ['eng']
    }
    // re-recognize if language set changed
    const key = finalLangs.slice().sort().join('+')
    const curKey = langs.slice().sort().join('+')
    if (key !== curKey) {
      onProgress({ stage: 'recognize', progress: 0.6, detail: `Re-OCR in ${finalLangs.join(' + ')}` })
      try {
        await worker.reinitialize(finalLangs)
        const second = await worker.recognize(canvas, {}, { text: true, blocks: true })
        const p2 = extractLines(second.data.blocks)
        if (p2.lines.length >= parsed.lines.length * 0.8) parsed = p2
      } catch {
        // keep pass-1 result if language pack unavailable
      }
    }
  }

  onProgress({ stage: 'normalize', progress: 0.85, detail: 'Mapping bounding boxes & confidence' })

  // --- 5. normalize to OcrLine with unified bboxes ---
  const lines: OcrLine[] = parsed.lines.map((l) => ({
    text: l.text.replace(/\s+/g, ' ').trim(),
    bbox: { x: l.bbox.x0, y: l.bbox.y0, w: l.bbox.x1 - l.bbox.x0, h: l.bbox.y1 - l.bbox.y0 },
    confidence: Math.max(0, Math.min(1, (l.confidence ?? 0) / 100)),
    height: l.bbox.y1 - l.bbox.y0,
  }))
  const text = (first.data.text || parsed.text || lines.map((l) => l.text).join('\n')).trim()

  const language = opts.manualLangs
    ? { ...languageFromRatios(ratios, 'manual'), ocrLangs: finalLangs }
    : languageFromRatios(ratios, method, osdScript, osdConf)

  onProgress({ stage: 'done', progress: 1, detail: `${lines.length} lines · ${language.scriptLabel}` })

  return {
    ocrText: text,
    lines,
    language,
    processedDataUrl: dataUrl,
    displayDataUrl: displayUrl,
  }
}

function langForScript(script: string): string | undefined {
  const map: Record<string, string> = {
    Devanagari: 'hin', Bengali: 'ben', Gurmukhi: 'pan', Gujarati: 'guj', Oriya: 'ori',
    Tamil: 'tam', Telugu: 'tel', Kannada: 'kan', Malayalam: 'mal',
  }
  return map[script]
}

/** Terminate the shared worker (called on unmount). */
export async function disposeOcr(): Promise<void> {
  if (workerPromise) {
    try {
      const w = await workerPromise
      await w.terminate()
    } catch { /* noop */ }
    workerPromise = null
  }
}

// LabelIQ — image preprocessing layer (the "OpenCV" stage of the pipeline)
// All operations are pure canvas implementations: grayscale, contrast stretch,
// Otsu binarization, rotation, and scaling. Runs entirely in the browser.

import type { BBox } from '@/lib/types'

export interface PreprocessOptions {
  rotation: number // degrees: 0 | 90 | 180 | 270 | arbitrary
  grayscale: boolean
  contrast: number // -100..100
  brightness: number // -100..100
  binarize: boolean
  scale: number // 1..3 upscale factor
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  rotation: 0,
  grayscale: true,
  contrast: 15,
  brightness: 0,
  binarize: false,
  scale: 1,
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Load a File/Blob into a dataURL (JPEG, downscaled to maxDim). */
export function fileToDataUrl(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const url = URL.createObjectURL(file)
      const img = await loadImage(url)
      const { dataUrl } = processImage(img, { ...DEFAULT_PREPROCESS, scale: 1 }, maxDim, quality)
      URL.revokeObjectURL(url)
      resolve(dataUrl)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Core processing: rotation → scale → grayscale → brightness/contrast → optional Otsu binarize.
 * Returns the processed canvas + a stored (grayscale-off) version for evidence display.
 */
export function processImage(
  img: HTMLImageElement | HTMLCanvasElement,
  opts: PreprocessOptions,
  maxDim = 1600,
  quality = 0.85,
): { canvas: HTMLCanvasElement; dataUrl: string; displayUrl: string } {
  const rot = ((opts.rotation % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height

  // target size: clamp to maxDim, apply scale
  let tw = iw * opts.scale
  let th = ih * opts.scale
  const ratio = Math.min(1, maxDim / Math.max(tw, th))
  tw = Math.round(tw * ratio)
  th = Math.round(th * ratio)

  const cw = swap ? th : tw
  const ch = swap ? tw : th
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.drawImage(img, -tw / 2, -th / 2, tw, th)
  ctx.restore()

  // pixel ops
  const im = ctx.getImageData(0, 0, cw, ch)
  const d = im.data
  const c = (opts.contrast + 100) / 100
  const b = opts.brightness * 2.55

  if (opts.grayscale || opts.binarize) {
    for (let i = 0; i < d.length; i += 4) {
      let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      v = (v - 128) * c + 128 + b
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v))
    }
  } else if (opts.contrast !== 0 || opts.brightness !== 0) {
    for (let i = 0; i < d.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const v = (d[i + k] - 128) * c + 128 + b
        d[i + k] = Math.max(0, Math.min(255, v))
      }
    }
  }

  if (opts.binarize) {
    const t = otsuThreshold(d)
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] > t ? 255 : 0
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }

  ctx.putImageData(im, 0, 0)

  const dataUrl = canvas.toDataURL('image/jpeg', quality)

  // display version: same geometry, no pixel ops (for the evidence overlay + report)
  const disp = document.createElement('canvas')
  disp.width = cw
  disp.height = ch
  const dctx = disp.getContext('2d')!
  dctx.save()
  dctx.translate(cw / 2, ch / 2)
  dctx.rotate((rot * Math.PI) / 180)
  dctx.drawImage(img, -tw / 2, -th / 2, tw, th)
  dctx.restore()

  return { canvas, dataUrl, displayUrl: disp.toDataURL('image/jpeg', quality) }
}

function otsuThreshold(d: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0)
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    hist[d[i]]++
    n++
  }
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0
  let wB = 0
  let maxVar = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }
  return threshold
}

/** Crop an evidence region from a canvas, padded, returned as dataURL. */
export function cropEvidence(
  img: HTMLImageElement | HTMLCanvasElement,
  box: BBox,
  pad = 14,
  scale = 2,
): string {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  const w = Math.min(iw - x, box.w + pad * 2)
  const h = Math.min(ih - y, box.h + pad * 2)
  const out = document.createElement('canvas')
  out.width = w * scale
  out.height = h * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img as CanvasImageSource, x, y, w, h, 0, 0, w * scale, h * scale)
  return out.toDataURL('image/png')
}

// LabelIQ — full-screen image crop editor.
//
// Used between capture/upload and OCR: drag a rectangle over the label,
// resize with corner/edge handles, apply → the crop is cut from the ORIGINAL
// pixels at natural resolution (not the downscaled preview) and handed back
// as a JPEG dataURL. Pointer-events based, so it works with mouse and touch.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Crop, RotateCcw, X } from 'lucide-react'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface Sel {
  x: number
  y: number
  w: number
  h: number
}

interface ImgRect {
  left: number
  top: number
  w: number
  h: number
}

const MIN_DISPLAY = 40 // px, in display coordinates

export function ImageCrop({
  src,
  onApply,
  onCancel,
}: {
  src: string
  onApply: (dataUrl: string) => void
  onCancel: () => void
}) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgRect, setImgRect] = useState<ImgRect | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [sel, setSel] = useState<Sel | null>(null)
  const [busy, setBusy] = useState(false)

  const drag = useRef<{
    mode: 'move' | Handle
    startX: number
    startY: number
    orig: Sel
  } | null>(null)

  // measure the rendered image inside the area (its offset + displayed size)
  const measure = useCallback(() => {
    const img = imgRef.current
    const area = areaRef.current
    if (!img || !area) return
    const ib = img.getBoundingClientRect()
    const ab = area.getBoundingClientRect()
    const rect = { left: ib.left - ab.left, top: ib.top - ab.top, w: ib.width, h: ib.height }
    setImgRect(rect)
    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    // (re)seed the selection at 90% centered, clamped
    setSel((prev) => {
      const m = Math.min(rect.w, rect.h) * 0.05
      const def = { x: m, y: m, w: rect.w - 2 * m, h: rect.h - 2 * m }
      if (!prev) return def
      // keep proportions sensible if the box changed under us
      const clamped = clampSel(prev, rect)
      return clamped.w < MIN_DISPLAY || clamped.h < MIN_DISPLAY ? def : clamped
    })
  }, [])

  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (areaRef.current) ro.observe(areaRef.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  // esc closes (same as cancel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  // ---------- pointer interaction ----------

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | Handle) => {
    if (!imgRect || !sel) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...sel } }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !imgRect) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    const o = d.orig

    if (d.mode === 'move') {
      setSel(clampSel({ ...o, x: o.x + dx, y: o.y + dy }, imgRect))
      return
    }

    // resize: adjust the edges the handle controls, keep the opposite fixed
    let x1 = o.x
    let y1 = o.y
    let x2 = o.x + o.w
    let y2 = o.y + o.h
    if (d.mode.includes('w')) x1 = o.x + dx
    if (d.mode.includes('e')) x2 = o.x + o.w + dx
    if (d.mode.includes('n')) y1 = o.y + dy
    if (d.mode.includes('s')) y2 = o.y + o.h + dy

    // normalize when dragged past the opposite edge
    if (x2 - x1 < MIN_DISPLAY) {
      if (d.mode.includes('w')) x1 = x2 - MIN_DISPLAY
      else x2 = x1 + MIN_DISPLAY
    }
    if (y2 - y1 < MIN_DISPLAY) {
      if (d.mode.includes('n')) y1 = y2 - MIN_DISPLAY
      else y2 = y1 + MIN_DISPLAY
    }

    setSel(clampSel({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, imgRect))
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
    drag.current = null
  }

  // ---------- apply ----------

  const apply = async () => {
    const img = imgRef.current
    if (!imgRect || !sel || !img || busy) return
    setBusy(true)
    try {
      const scaleX = img.naturalWidth / imgRect.w
      const scaleY = img.naturalHeight / imgRect.h
      const sx = Math.max(0, Math.round(sel.x * scaleX))
      const sy = Math.max(0, Math.round(sel.y * scaleY))
      const sw = Math.min(img.naturalWidth - sx, Math.round(sel.w * scaleX))
      const sh = Math.min(img.naturalHeight - sy, Math.round(sel.h * scaleY))
      if (sw < 16 || sh < 16) {
        onCancel()
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      onApply(canvas.toDataURL('image/jpeg', 0.92))
    } catch {
      onCancel()
    }
  }

  // ---------- render helpers ----------

  const handles: { h: Handle; style: React.CSSProperties }[] = sel
    ? [
        { h: 'nw', style: { left: -6, top: -6, cursor: 'nwse-resize' } },
        { h: 'n', style: { left: '50%', top: -6, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
        { h: 'ne', style: { right: -6, top: -6, cursor: 'nesw-resize' } },
        { h: 'e', style: { right: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' } },
        { h: 'se', style: { right: -6, bottom: -6, cursor: 'nwse-resize' } },
        { h: 's', style: { left: '50%', bottom: -6, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
        { h: 'sw', style: { left: -6, bottom: -6, cursor: 'nesw-resize' } },
        { h: 'w', style: { left: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' } },
      ]
    : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Crop className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-semibold">Crop the label region</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="mr-1 h-4 w-4" /> Cancel
        </Button>
      </header>

      <div
        ref={areaRef}
        className="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden p-4"
      >
        <img
          ref={imgRef}
          src={src}
          alt="Crop source"
          className="max-h-full max-w-full object-contain"
          draggable={false}
          onLoad={measure}
        />

        {imgRect && sel && (
          <>
            {/* scrim outside the selection (4 panes) */}
            <div className="pointer-events-none absolute bg-black/65" style={{ left: 0, top: 0, width: imgRect.left, height: '100%' }} />
            <div className="pointer-events-none absolute bg-black/65" style={{ left: imgRect.left + imgRect.w, top: 0, right: 0, height: '100%' }} />
            <div className="pointer-events-none absolute bg-black/65" style={{ left: imgRect.left, top: 0, width: imgRect.w, height: imgRect.top }} />
            <div className="pointer-events-none absolute bg-black/65" style={{ left: imgRect.left, top: imgRect.top + imgRect.h, width: imgRect.w, bottom: 0 }} />

            {/* selection */}
            <div
              className="absolute cursor-move border-2 border-teal-400"
              style={{
                left: imgRect.left + sel.x,
                top: imgRect.top + sel.y,
                width: sel.w,
                height: sel.h,
                touchAction: 'none',
              }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* corner brackets for the app look */}
              <span className="pointer-events-none absolute -left-2 -top-2 h-4 w-4 border-l-[3px] border-t-[3px] border-teal-300" />
              <span className="pointer-events-none absolute -right-2 -top-2 h-4 w-4 border-r-[3px] border-t-[3px] border-teal-300" />
              <span className="pointer-events-none absolute -bottom-2 -left-2 h-4 w-4 border-b-[3px] border-l-[3px] border-teal-300" />
              <span className="pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 border-b-[3px] border-r-[3px] border-teal-300" />

              {/* resize handles */}
              {handles.map(({ h, style }) => (
                <span
                  key={h}
                  className="absolute h-3 w-3 rounded-sm border border-teal-200 bg-teal-400 shadow"
                  style={{ ...style, touchAction: 'none' }}
                  onPointerDown={(e) => onPointerDown(e, h)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-[11px] leading-tight text-muted-foreground">
          Drag to move · handles to resize · crop is cut at full resolution. Cropping to the
          label text improves OCR and the AI reader.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!imgRect) return
              const m = Math.min(imgRect.w, imgRect.h) * 0.05
              setSel({ x: m, y: m, w: imgRect.w - 2 * m, h: imgRect.h - 2 * m })
            }}
            disabled={busy}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={() => void apply()} disabled={busy || !sel}>
            {busy ? <Check className="mr-1 h-3.5 w-3.5 animate-pulse" /> : <Check className="mr-1 h-3.5 w-3.5" />}
            Apply crop
          </Button>
        </div>
      </footer>
    </div>
  )
}

/** keep a selection inside the image and above the minimum size */
function clampSel(s: Sel, r: ImgRect): Sel {
  const w = Math.max(MIN_DISPLAY, Math.min(s.w, r.w))
  const h = Math.max(MIN_DISPLAY, Math.min(s.h, r.h))
  const x = Math.max(0, Math.min(s.x, r.w - w))
  const y = Math.max(0, Math.min(s.y, r.h - h))
  return { x, y, w, h }
}

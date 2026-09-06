// LabelIQ — shared small UI pieces

'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BBox } from '@/lib/types'

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    COMPLIANT: { cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30', label: 'Compliant' },
    VIOLATION: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Violation' },
    MISSING: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Missing' },
    WARNING: { cls: 'bg-amber-500/15 text-amber-200 border-amber-500/30', label: 'Warning' },
  }
  const m = map[severity] ?? { cls: '', label: severity }
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide', m.cls)}>{m.label}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    COMPLIANT: { cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30', label: 'Compliant' },
    NON_COMPLIANT: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Non-Compliant' },
    PENDING_REVIEW: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Pending Review' },
    REVIEWED: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Reviewed' },
    AUTO: { cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30', label: 'Auto' },
    PENDING: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Awaiting Review' },
    ACCEPTED: { cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30', label: 'Accepted' },
    MODIFY: { cls: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30', label: 'Modified' },
    MODIFIED: { cls: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30', label: 'Modified' },
    REJECTED: { cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30', label: 'False Positive' },
  }
  const m = map[status] ?? { cls: '', label: status }
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide', m.cls)}>{m.label}</span>
}

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const color = value >= 0.9 ? 'bg-teal-400' : value >= 0.75 ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-700/60">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

export function ScriptChips({ ratios }: { ratios: Record<string, number> }) {
  const entries = Object.entries(ratios).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([script, v]) => (
        <Badge key={script} variant="outline" className="gap-1 border-teal-500/25 bg-teal-500/10 font-mono text-[10px] text-teal-200">
          {script}
          <span className="text-teal-400/70">{Math.round(v * 100)}%</span>
        </Badge>
      ))}
    </div>
  )
}

/** Evidence image with bounding-box overlay; highlights the active finding.
 *  Boxes are given in image pixel coords and mapped to percentages on load. */
export function EvidenceOverlay({
  imageData,
  boxes,
  activeIdx,
  onSelect,
  className,
  maxHeight = 420,
}: {
  imageData: string
  boxes: { bbox: BBox; color?: string }[]
  activeIdx?: number | null
  onSelect?: (idx: number) => void
  className?: string
  maxHeight?: number
}) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  return (
    <div className={cn('relative inline-block', className)}>
      { }
      <img
        src={imageData}
        alt="Package label evidence"
        className="block max-w-full rounded-md border border-border"
        style={{ maxHeight }}
        onLoad={(e) => {
          const t = e.currentTarget
          if (!nat) setNat({ w: t.naturalWidth, h: t.naturalHeight })
        }}
        ref={(el) => {
          if (el && el.complete && !nat) setNat({ w: el.naturalWidth, h: el.naturalHeight })
        }}
      />
      {nat &&
        boxes.map((b, i) => {
          const active = i === activeIdx
          const pos = {
            left: `${(b.bbox.x / nat.w) * 100}%`,
            top: `${(b.bbox.y / nat.h) * 100}%`,
            width: `${(Math.max(8, b.bbox.w) / nat.w) * 100}%`,
            height: `${(Math.max(8, b.bbox.h) / nat.h) * 100}%`,
          }
          return (
            <button
              key={i}
              type="button"
              onClick={onSelect ? () => onSelect(i) : undefined}
              aria-label={`Evidence box ${i + 1}`}
              title={onSelect ? `Evidence ${i + 1}` : undefined}
              className={cn(
                'absolute rounded-[3px] transition-all',
                active ? 'z-10 opacity-100' : 'opacity-70 hover:opacity-100',
              )}
              style={{
                ...pos,
                outline: active ? '2px solid #FBBF24' : b.color ?? '#2DD4BF',
                outlineOffset: '1px',
                background: active ? 'rgba(251,191,36,0.18)' : 'rgba(45,212,191,0.12)',
                border: 'none',
                cursor: onSelect ? 'pointer' : 'default',
                padding: 0,
              }}
            />
          )
        })}
    </div>
  )
}

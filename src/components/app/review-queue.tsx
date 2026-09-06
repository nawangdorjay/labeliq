// LabelIQ — inspector review queue (human-in-the-loop)
// Low-confidence / violation findings wait here for Accept / Modify / Reject.

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { BadgeCheck, Check, ClipboardCheck, Loader2, Pencil, X } from 'lucide-react'
import type { FindingDTO, ScanDTO } from '@/lib/types'
import { ConfidenceBar, SeverityBadge } from './bits'
import { toast } from 'sonner'

interface Row {
  scan: ScanDTO
  finding: FindingDTO
}

export function ReviewQueue({ onMutate, onOpenScan }: { onMutate: () => void; onOpenScan: (scan: ScanDTO) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newValue, setNewValue] = useState('')
  const [focused, setFocused] = useState(0)

  const load = async () => {
    const res = await fetch('/api/scans?status=PENDING_REVIEW&pageSize=50')
    const json = await res.json()
    const flat: Row[] = (json.scans as ScanDTO[]).flatMap((scan) =>
      scan.findings.filter((f) => f.status === 'PENDING').map((finding) => ({ scan, finding })),
    )
    setRows(flat)
  }

  useEffect(() => { load() }, [])

  const act = async (row: Row, action: 'ACCEPT' | 'MODIFY' | 'REJECT', body: Record<string, unknown> = {}) => {
    setBusyId(row.finding.id)
    try {
      const res = await fetch(`/api/findings/${row.finding.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'ACCEPT' ? 'Finding accepted' : action === 'REJECT' ? 'False positive recorded' : 'Corrected & re-validated')
      await load()
      onMutate()
    } catch {
      toast.error('Verification failed')
    } finally {
      setBusyId(null)
      setEditing(null)
    }
  }

  // keyboard shortcuts: A / M / R
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rows || rows.length === 0) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const row = rows[Math.min(focused, rows.length - 1)]
      if (e.key === 'ArrowDown') { setFocused((f) => Math.min(rows.length - 1, f + 1)); e.preventDefault() }
      if (e.key === 'ArrowUp') { setFocused((f) => Math.max(0, f - 1)); e.preventDefault() }
      if (busyId) return
      if (e.key === 'a' || e.key === 'A') act(row, 'ACCEPT')
      if (e.key === 'm' || e.key === 'M') { setEditing(row.finding.id); setNewValue(row.finding.extractedValue ?? '') }
      if (e.key === 'r' || e.key === 'R') act(row, 'REJECT')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, focused, busyId])

  const verdictPreview = useMemo(() => {
    if (!rows) return null
    return `${rows.length} finding(s) across ${new Set(rows.map((r) => r.scan.id)).size} scan(s)`
  }, [rows])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ClipboardCheck className="h-5 w-5 text-amber-300" /> Review queue
          </h2>
          <p className="text-sm text-muted-foreground">
            The inspector makes the final call — every AI finding is confirmable, correctable or rejectable.
          </p>
        </div>
        {verdictPreview && <span className="rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">{verdictPreview}</span>}
      </header>

      {rows === null && (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {rows && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Check className="h-8 w-8 text-teal-300" />
            <p className="font-medium">Queue is clear</p>
            <p className="text-sm text-muted-foreground">No findings are waiting for review. Scan a label or check history.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {rows?.map((row, i) => {
          const busy = busyId === row.finding.id
          return (
            <Card
              key={row.finding.id}
              className={`py-0 transition-all ${i === focused ? 'border-amber-400/50 shadow-md shadow-amber-500/5' : ''} ${row.finding.severity === 'VIOLATION' || row.finding.severity === 'MISSING' ? 'border-l-4 border-l-rose-500/70' : 'border-l-4 border-l-amber-500/60'}`}
              onMouseEnter={() => setFocused(i)}
            >
              <CardContent className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                <button type="button" onClick={() => onOpenScan(row.scan)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  { }
                  <img src={row.scan.imageData} alt="" className="hidden h-14 w-11 shrink-0 rounded border border-border object-cover sm:block" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={row.finding.severity} />
                      <span className="truncate text-sm font-medium">{row.finding.ruleTitle}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.scan.fileName} · {row.scan.category} · {row.scan.languageLabel.split(' + ')[0]}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{row.finding.ruleRef}</p>
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  <div className="hidden text-right md:block">
                    <div className="font-mono text-xs text-slate-300">{row.finding.extractedValue ?? '—'}</div>
                    <ConfidenceBar value={row.finding.confidence} />
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 hover:text-teal-200" disabled={busy} onClick={() => act(row, 'ACCEPT')} aria-label="Accept finding">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => { setEditing(row.finding.id); setNewValue(row.finding.extractedValue ?? '') }} aria-label="Modify value">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => act(row, 'REJECT')} aria-label="Reject as false positive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>

              {editing === row.finding.id && (
                <div className="border-t border-border bg-teal-500/5 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-teal-200">Correct the extracted value (A-ccepts deterministic re-validation)</p>
                  <div className="flex flex-wrap gap-2">
                    <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. ₹ 120.00" className="h-8 w-56 font-mono text-xs" autoFocus />
                    <Button size="sm" className="h-8" disabled={busy} onClick={() => act(row, 'MODIFY', { newValue })}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Save & re-validate
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// LabelIQ — scan detail: evidence, findings, verification actions, PDF export

'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  BadgeCheck, Check, FileDown, Loader2, Pencil, ScrollText, Trash2, X,
} from 'lucide-react'
import type { FindingDTO, ScanDTO } from '@/lib/types'
import { FIELD_LABEL } from '@/lib/rules/synonyms'
import { generateScanReport } from '@/lib/client/report'
import { ConfidenceBar, EvidenceOverlay, ScriptChips, SeverityBadge, StatusBadge } from './bits'

export function ScanDetail({
  scan,
  onClose,
  onMutate,
  onDelete,
}: {
  scan: ScanDTO | null
  onClose: () => void
  onMutate: () => void
  onDelete?: (id: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<FindingDTO | null>(null)
  const [newValue, setNewValue] = useState('')
  const [activeBox, setActiveBox] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)

  const boxes = useMemo(() => {
    if (!scan) return []
    return scan.findings
      .filter((f) => f.evidenceBox)
      .map((f) => ({
        bbox: f.evidenceBox!,
        color:
          f.severity === 'COMPLIANT' ? '#2DD4BF' : f.severity === 'WARNING' ? '#FBBF24' : '#F87171',
        id: f.id,
      }))
  }, [scan])

  if (!scan) return null

  const exportPdf = async () => {
    setPdfBusy(true)
    try {
      await generateScanReport(scan)
      toast.success('PDF report downloaded')
    } catch (e) {
      console.error('[scan-detail] pdf export failed', e)
      toast.error('PDF export failed — please try again')
    } finally {
      setPdfBusy(false)
    }
  }

  const act = async (finding: FindingDTO, action: 'ACCEPT' | 'MODIFY' | 'REJECT', body: Record<string, unknown> = {}) => {
    setBusyId(finding.id)
    try {
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      if (!res.ok) throw new Error()
      toast.success(
        action === 'ACCEPT' ? 'Finding accepted' : action === 'REJECT' ? 'Marked as false positive' : 'Value corrected & re-validated',
      )
      onMutate()
      setEditing(null)
    } catch {
      toast.error('Verification failed')
    } finally {
      setBusyId(null)
    }
  }

  const violations = scan.findings.filter((f) => (f.severity === 'VIOLATION' || f.severity === 'MISSING') && f.status !== 'REJECTED')
  const pending = scan.findings.filter((f) => f.status === 'PENDING')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[min(1100px,95vw)] flex-col overflow-hidden p-0 supports-[height:100dvh]:max-h-[92dvh] sm:max-w-[min(1100px,95vw)]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center gap-3">
            <ScrollText className="h-5 w-5 text-teal-300" />
            <DialogTitle className="font-mono text-base">{scan.fileName}</DialogTitle>
            <StatusBadge status={scan.status} />
            {violations.length > 0 && (
              <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">{violations.length} violation(s)</span>
            )}
            {pending.length > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">{pending.length} awaiting review</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>scan <span className="font-mono text-teal-300/80">{scan.id.slice(0, 10)}</span></span>
            <span>{new Date(scan.createdAt).toLocaleString('en-IN')}</span>
            <span>category <span className="text-slate-300">{scan.category}</span></span>
            <span>rules <span className="font-mono text-slate-300">{scan.ruleVersion}</span></span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">mean confidence</span>
            <ConfidenceBar value={scan.overallConfidence} />
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto overscroll-contain md:grid-cols-[minmax(280px,380px)_1fr]">
          {/* evidence column */}
          <div className="space-y-3 border-b border-border p-4 md:border-b-0 md:border-r">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
              <button className="text-[11px] text-teal-300 hover:underline" onClick={() => setExpanded((v) => !v)}>{expanded ? 'hide' : 'show'}</button>
            </div>
            {expanded && (
              <div className="flex justify-center">
                <EvidenceOverlay
                  imageData={scan.imageData}
                  boxes={boxes.map((b) => ({ bbox: b.bbox, color: b.color }))}
                  activeIdx={activeBox ? boxes.findIndex((b) => b.id === activeBox) : null}
                  onSelect={(i) => setActiveBox(boxes[i]?.id ?? null)}
                  maxHeight={380}
                />
              </div>
            )}
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Language detection</p>
            <div className="space-y-2">
              <div className="text-sm font-medium">{scan.languageLabel}</div>
              <ScriptChips ratios={scan.languageRatios} />
              <div className="text-[11px] text-muted-foreground">
                method <span className="font-mono text-teal-300">{scan.detectionMethod}</span> · OCR <span className="font-mono text-teal-300">{scan.ocrLangs}</span>
              </div>
            </div>
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Normalized fields</p>
            <div className="space-y-1">
              {scan.fields.length === 0 && <p className="text-xs text-muted-foreground">(none detected)</p>}
              {scan.fields.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{FIELD_LABEL[f.field as keyof typeof FIELD_LABEL] ?? f.field}</div>
                    <div className="truncate text-xs font-medium">{f.value ?? <span className="text-amber-300">not parsed</span>}</div>
                  </div>
                  <ConfidenceBar value={f.confidence} />
                </div>
              ))}
            </div>
          </div>

          {/* findings column */}
          <div className="space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Findings — rule citations, severity & verification trail
            </p>
            {scan.findings.map((f) => {
              const busy = busyId === f.id
              return (
                <Card
                  key={f.id}
                  className={`py-0 transition-colors ${activeBox === f.id ? 'border-amber-400/50' : ''}`}
                  onMouseEnter={() => f.evidenceBox && setActiveBox(f.id)}
                >
                  <CardContent className="space-y-2.5 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={f.severity} />
                        <span className="text-sm font-medium">{f.ruleTitle}</span>
                      </div>
                      <StatusBadge status={f.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="font-mono text-teal-300/80">{f.ruleRef}</span>
                      <span>layer <span className="font-mono">{f.ruleLayer}</span></span>
                      <ConfidenceBar value={f.confidence} />
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">{f.reason}</p>
                    {f.extractedValue && (
                      <p className="rounded-md bg-black/25 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                        extracted: {f.extractedValue}
                        {f.reviewedValue && <span className="text-teal-300"> → corrected: {f.reviewedValue}</span>}
                      </p>
                    )}
                    {f.status === 'PENDING' && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button size="sm" variant="outline" className="h-7 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 hover:text-teal-200" disabled={busy} onClick={() => act(f, 'ACCEPT')}>
                          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accept
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => { setEditing(f); setNewValue(f.extractedValue ?? f.reviewedValue ?? '') }}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Modify
                        </Button>
                        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => act(f, 'REJECT')}>
                          <X className="mr-1 h-3.5 w-3.5" /> False positive
                        </Button>
                        <span className="text-[10px] text-muted-foreground">keys: A · M · R</span>
                      </div>
                    )}
                    {f.inspectorNote && (
                      <p className="text-[11px] italic text-muted-foreground">inspector: “{f.inspectorNote}”</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {editing && (
              <div className="rounded-lg border border-teal-500/40 bg-teal-500/5 p-3">
                <p className="mb-2 text-xs font-semibold text-teal-200">Correct the extracted value — the rule re-validates deterministically</p>
                <div className="flex gap-2">
                  <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. ₹ 120.00" className="h-8 font-mono text-xs" />
                  <Button size="sm" className="h-8" disabled={busyId === editing.id} onClick={() => act(editing, 'MODIFY', { newValue })}>
                    {busyId === editing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* sticky action bar — Export PDF / Delete are ALWAYS reachable, no
            matter how tall the findings list is or how small the screen */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card/70 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            AI reads the label · rules interpret the law · the inspector decides
          </p>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={pdfBusy} onClick={() => void exportPdf()}>
              {pdfBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1 h-3.5 w-3.5" />} Export PDF report
            </Button>
            {onDelete && (
              <Button size="sm" variant="ghost" className="flex-1 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 sm:flex-none" onClick={() => { onDelete(scan.id); onClose() }}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete scan
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

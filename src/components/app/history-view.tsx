// LabelIQ — searchable scan history with filters, pagination, CSV export

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, FileSpreadsheet, History, Loader2, ScanSearch, Trash2 } from 'lucide-react'
import type { ScanDTO } from '@/lib/types'
import { ConfidenceBar, SeverityBadge, StatusBadge } from './bits'
import { exportScansCsv } from '@/lib/client/report'

export function HistoryView({ onOpenScan, onMutate }: { onOpenScan: (s: ScanDTO) => void; onMutate: () => void }) {
  const [scans, setScans] = useState<ScanDTO[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [script, setScript] = useState('ALL')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '12' })
    if (q) params.set('q', q)
    if (status !== 'ALL') params.set('status', status)
    if (category !== 'ALL') params.set('category', category)
    if (script !== 'ALL') params.set('script', script)
    const res = await fetch(`/api/scans?${params}`)
    const json = await res.json()
    setScans(json.scans as ScanDTO[])
    setTotal(json.total as number)
    setPages(json.pages as number)
  }, [page, q, status, category, script])

  useEffect(() => { load() }, [load])

  // debounce search
  const [qInput, setQInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput) }, 350)
    return () => clearTimeout(t)
  }, [qInput])

  const del = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Scan deleted')
      await load()
      onMutate()
    } catch {
      toast.error('Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const scripts = useMemo(() => {
    const set = new Set((scans ?? []).map((s) => s.scriptDetected))
    set.add('Devanagari'); set.add('Tamil'); set.add('Latin'); set.add('Telugu'); set.add('Bengali')
    return [...set]
  }, [scans])

  const categories = useMemo(() => {
    const set = new Set((scans ?? []).map((s) => s.category))
    return [...set]
  }, [scans])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <History className="h-5 w-5 text-teal-300" /> Scan history
          </h2>
          <p className="text-sm text-muted-foreground">Searchable, filterable record of every inspection — full audit trail.</p>
        </div>
        {scans && scans.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => exportScansCsv(scans)}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Export CSV (page)
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <ScanSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search file, OCR text, rule…" className="pl-8" />
        </div>
        <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v) }}>
          <SelectTrigger className="w-[150px]" aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="COMPLIANT">Compliant</SelectItem>
            <SelectItem value="NON_COMPLIANT">Non-Compliant</SelectItem>
            <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
            <SelectItem value="REVIEWED">Reviewed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => { setPage(1); setCategory(v) }}>
          <SelectTrigger className="w-[150px]" aria-label="Category filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={script} onValueChange={(v) => { setPage(1); setScript(v) }}>
          <SelectTrigger className="w-[150px]" aria-label="Script filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All scripts</SelectItem>
            {scripts.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {scans === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : scans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No scans match the current filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">File</TableHead>
                  <TableHead>Scanned</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Findings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.map((s) => {
                  const violations = s.findings.filter((f) => (f.severity === 'VIOLATION' || f.severity === 'MISSING') && f.status !== 'REJECTED').length
                  const pending = s.findings.filter((f) => f.status === 'PENDING').length
                  return (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => onOpenScan(s)}>
                      <TableCell className="max-w-[200px] truncate pl-4 font-medium">{s.fileName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</TableCell>
                      <TableCell><span className="text-xs">{s.category}</span></TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{s.languageLabel.split(' + ')[0]}</TableCell>
                      <TableCell><ConfidenceBar value={s.overallConfidence} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={violations ? 'font-semibold text-rose-300' : 'text-teal-300'}>{violations} ✕</span>
                          <span className="text-muted-foreground">/ {s.findings.length}</span>
                          {pending > 0 && <span className="rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-300">{pending} pending</span>}
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          size="sm" variant="ghost" className="h-7 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          disabled={deleting === s.id}
                          onClick={(e) => { e.stopPropagation(); del(s.id) }}
                          aria-label="Delete scan"
                        >
                          {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{total} scans · page {page}/{pages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" className="h-8" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  )
}

// LabelIQ — app shell
// SIH26034: Software system to check compliance of Packaged Commodities under
// Legal Metrology (Packaged Commodities) Rules, 2011 by scanning products, images and labels.
// Single-route app: dashboard · scan · review queue · history · rules

'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ClipboardCheck, History, LayoutDashboard, ScanLine, Scale, ShieldCheck,
} from 'lucide-react'
import type { ScanDTO } from '@/lib/types'
import { Dashboard } from '@/components/app/dashboard'
import { ScanView } from '@/components/app/scan-view'
import { ReviewQueue } from '@/components/app/review-queue'
import { HistoryView } from '@/components/app/history-view'
import { RulesBrowser } from '@/components/app/rules-browser'
import { ScanDetail } from '@/components/app/scan-detail'

type View = 'dashboard' | 'scan' | 'review' | 'history' | 'rules'

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'scan', label: 'Scan label', icon: <ScanLine className="h-4 w-4" /> },
  { id: 'review', label: 'Review queue', icon: <ClipboardCheck className="h-4 w-4" /> },
  { id: 'history', label: 'History', icon: <History className="h-4 w-4" /> },
  { id: 'rules', label: 'Rules', icon: <Scale className="h-4 w-4" /> },
]

export default function Home() {
  const [view, setView] = useState<View>('dashboard')
  const [detail, setDetail] = useState<ScanDTO | null>(null)
  const qc = useQueryClient()

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['stats'] })
  }, [qc])

  const openScan = useCallback((s: ScanDTO) => setDetail(s), [])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-500/30">
              <ShieldCheck className="h-5 w-5 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">Label<span className="text-teal-300">IQ</span></span>
                <Badge variant="outline" className="hidden border-teal-500/30 font-mono text-[10px] text-teal-300/90 sm:inline-flex">
                  SIH26034
                </Badge>
              </div>
              <p className="hidden text-[11px] text-muted-foreground md:block">
                Legal Metrology (PCR 2011) label compliance — scan · detect · validate · evidence
              </p>
            </div>
          </div>

          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Main navigation">
            {NAV.map((n) => (
              <Button
                key={n.id}
                size="sm"
                variant="ghost"
                className={cn(
                  'h-9 gap-2 text-muted-foreground hover:bg-teal-500/10 hover:text-teal-200',
                  view === n.id && 'bg-teal-500/15 text-teal-200',
                )}
                onClick={() => setView(n.id)}
              >
                {n.icon}
                <span className="hidden lg:inline">{n.label}</span>
              </Button>
            ))}
          </nav>

          <Button size="sm" className="ml-auto gap-2 md:ml-2" onClick={() => setView('scan')}>
            <ScanLine className="h-4 w-4" /> <span className="hidden sm:inline">New scan</span>
          </Button>
        </div>

        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden" aria-label="Mobile navigation">
          {NAV.map((n) => (
            <Button
              key={n.id}
              size="sm"
              variant="ghost"
              className={cn(
                'h-8 shrink-0 gap-1.5 text-xs text-muted-foreground',
                view === n.id && 'bg-teal-500/15 text-teal-200',
              )}
              onClick={() => setView(n.id)}
            >
              {n.icon} {n.label}
            </Button>
          ))}
        </nav>
      </header>

      {/* main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {view === 'dashboard' && <Dashboard />}
        {view === 'scan' && <ScanView onSaved={(s) => { refresh(); setDetail(s) }} />}
        {view === 'review' && <ReviewQueue onMutate={refresh} onOpenScan={openScan} />}
        {view === 'history' && <HistoryView onOpenScan={openScan} onMutate={refresh} />}
        {view === 'rules' && <RulesBrowser />}
      </main>

      {/* footer */}
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
          <span>
            AI reads the label. Rules interpret the law. The inspector makes the final call.
          </span>
          <span className="font-mono">
            OCR · auto language detection · versioned rule engine · human-in-the-loop
          </span>
        </div>
      </footer>

      {/* scan detail dialog */}
      {detail && (
        <ScanDetail
          scan={detail}
          onClose={() => setDetail(null)}
          onMutate={() => {
            refresh()
            // refresh the detail row from the server
            fetch(`/api/scans/${detail.id}`)
              .then((r) => r.json())
              .then((j) => j.scan && setDetail(j.scan))
              .catch(() => undefined)
          }}
          onDelete={async (id) => {
            await fetch(`/api/scans/${id}`, { method: 'DELETE' })
            refresh()
          }}
        />
      )}
    </div>
  )
}

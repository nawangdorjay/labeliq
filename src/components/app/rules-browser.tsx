// LabelIQ — versioned rule repository browser

'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarClock, BookOpen, Info, Scale } from 'lucide-react'
import { RULES, RULE_VERSIONS, type Rule } from '@/lib/rules/repository'
import { cn } from '@/lib/utils'

export function RulesBrowser() {
  const [versionFilter, setVersionFilter] = useState<string>('ALL')

  const byLayer = useMemo(() => {
    const filtered = RULES.filter((r) => versionFilter === 'ALL' || r.version === versionFilter)
    return {
      TEXT: filtered.filter((r) => r.layer === 'TEXT'),
      VISUAL: filtered.filter((r) => r.layer === 'VISUAL'),
      CATEGORY: filtered.filter((r) => r.layer === 'CATEGORY'),
    }
  }, [versionFilter])

  const today = new Date()

  return (
    <div className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Scale className="h-5 w-5 text-teal-300" /> Rule repository
        </h2>
        <p className="text-sm text-muted-foreground">
          Versioned legal rules — the engine enforces only rules effective on the scan date, scoped by category.
        </p>
      </header>

      {/* version timeline */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {RULE_VERSIONS.map((v) => {
          const active = new Date(v.effectiveDate) <= today
          return (
            <Card key={v.id} className={cn('gap-2', active ? 'border-teal-500/30' : 'border-dashed opacity-80')}>
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{v.label}</span>
                  {active ? (
                    <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">ACTIVE</span>
                  ) : (
                    <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">FUTURE</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <CalendarClock className="h-3 w-3" /> effective {v.effectiveDate}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">{v.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs value={versionFilter} onValueChange={setVersionFilter}>
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="ALL">All versions</TabsTrigger>
            {RULE_VERSIONS.map((v) => (
              <TabsTrigger key={v.id} value={v.id}>{v.id}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={versionFilter} className="mt-4">
          <div className="space-y-4">
            {(
              [
                ['TEXT layer — presence · format · value', 'Deterministic checks on normalized fields', byLayer.TEXT],
                ['VISUAL layer — geometry proxies', 'Readability heuristics from OCR bounding boxes', byLayer.VISUAL],
                ['CATEGORY layer — scope-specific', 'Rules gated by product category or e-commerce mode', byLayer.CATEGORY],
              ] as const
            ).map(([title, subtitle, rules]) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rules.length === 0 && <p className="text-xs text-muted-foreground">No rules in this layer for the selected version.</p>}
                  {rules.map((r) => <RuleRow key={r.id} rule={r} />)}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RuleRow({ rule }: { rule: Rule }) {
  return (
    <div className="rounded-lg border border-border/70 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-teal-300/90">{rule.id}</span>
          <span className="text-sm font-medium">{rule.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {rule.status === 'INFORMATIVE' && (
            <span className="flex items-center gap-1 rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              <Info className="h-3 w-3" /> INFO-ONLY
            </span>
          )}
          {rule.ecommerceOnly && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">E-COMM</span>}
          {rule.appliesTo && <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">{rule.appliesTo.join(' · ')}</span>}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <BookOpen className="h-3 w-3" /> {rule.ref}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rule.hint}</p>
      {rule.expectedFormat && (
        <p className="mt-1 font-mono text-[10px] text-slate-400">expected: {rule.expectedFormat}</p>
      )}
    </div>
  )
}

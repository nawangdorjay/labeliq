// LabelIQ — dashboard: KPIs + charts over the scan corpus

'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, BadgeIndianRupee, ClipboardCheck, FileCheck2, Globe2, LayoutDashboard, Percent, ShieldCheck,
} from 'lucide-react'

interface Stats {
  total: number
  byStatus: Record<string, number>
  byScript: Record<string, number>
  byCategory: Record<string, number>
  topViolatedRules: { ruleId: string; ruleTitle: string; ruleRef: string; count: number }[]
  byDay: Record<string, number>
  avgConfidence: number
  ecommerceScans: number
}

const STATUS_COLORS: Record<string, string> = {
  COMPLIANT: '#2DD4BF',
  NON_COMPLIANT: '#F87171',
  PENDING_REVIEW: '#FBBF24',
  REVIEWED: '#34D399',
}
const SCRIPT_COLORS = ['#2DD4BF', '#FBBF24', '#F87171', '#A78BFA', '#F472B6', '#38BDF8', '#FB923C']

export function Dashboard() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => (await fetch('/api/stats')).json(),
    refetchInterval: 15000,
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" /><Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  const compliant = (data.byStatus.COMPLIANT ?? 0) + (data.byStatus.REVIEWED ?? 0)
  const complianceRate = data.total ? Math.round((compliant / data.total) * 100) : 0
  const pending = data.byStatus.PENDING_REVIEW ?? 0

  const days: { day: string; scans: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days.push({ day: d.slice(5).replace('-', '/'), scans: data.byDay[d] ?? 0 })
  }

  const statusPie = Object.entries(data.byStatus).map(([k, v]) => ({ name: k.replace('_', ' '), value: v }))
  const scriptPie = Object.entries(data.byScript).map(([k, v]) => ({ name: k, value: v }))

  return (
    <div className="space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <LayoutDashboard className="h-5 w-5 text-teal-300" /> Inspection dashboard
        </h2>
        <p className="text-sm text-muted-foreground">
          Live view of the enforcement corpus — scans, verdicts, languages and most-violated rules.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Total scans" value={String(data.total)} sub="all-time" />
        <KpiCard icon={<ShieldCheck className="h-4 w-4" />} label="Compliance rate" value={`${complianceRate}%`} sub={`${compliant} compliant / reviewed`} tone="teal" />
        <KpiCard icon={<ClipboardCheck className="h-4 w-4" />} label="Pending review" value={String(pending)} sub="inspector queue" tone={pending > 0 ? 'amber' : undefined} />
        <KpiCard icon={<Percent className="h-4 w-4" />} label="Mean confidence" value={`${Math.round(data.avgConfidence * 100)}%`} sub="OCR → field pipeline" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Scans — last 14 days</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="scans" stroke="#2DD4BF" strokeWidth={2} dot={{ r: 2.5, fill: '#2DD4BF' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Verdict distribution</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {statusPie.map((entry, i) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? SCRIPT_COLORS[i % SCRIPT_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Most-violated rules</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topViolatedRules.map((r) => ({ name: r.ruleId.replace('R-', ''), count: r.count }))} margin={{ top: 8, right: 12, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94A3B8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(45,212,191,0.08)' }} />
                <Bar dataKey="count" fill="#F87171" radius={[3, 3, 0, 0]} barSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe2 className="h-4 w-4 text-teal-300" /> Language coverage (auto-detected scripts)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={scriptPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {scriptPie.map((entry, i) => (
                    <Cell key={entry.name} fill={SCRIPT_COLORS[i % SCRIPT_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-teal-500/20 bg-gradient-to-br from-teal-500/5 to-transparent">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-center gap-3">
            <BadgeIndianRupee className="h-8 w-8 text-teal-300" />
            <div>
              <p className="font-semibold">e-commerce listing scans</p>
              <p className="text-sm text-muted-foreground">Validated against the 2026 1st Amendment (country-of-origin, eff. 1 Jul 2026)</p>
            </div>
          </div>
          <span className="font-mono text-3xl font-bold text-teal-300">{data.ecommerceScans}</span>
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-8 w-8 text-teal-300/70" />
            <div>
              <p className="font-semibold">Versioned rule repository</p>
              <p className="text-sm text-muted-foreground">PCR-2011 · Amdt-2017 · Amdt-2026-1 · Amdt-2026-2/3</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'teal' | 'amber'
}) {
  const color = tone === 'teal' ? 'text-teal-300' : tone === 'amber' ? 'text-amber-300' : 'text-foreground'
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</p>
          {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-lg border border-teal-500/20 bg-teal-500/10 p-2 text-teal-300">{icon}</div>
      </CardContent>
    </Card>
  )
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: '#0B1220',
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 8,
  fontSize: 12,
  color: '#E2E8F0',
}

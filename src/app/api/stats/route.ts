// LabelIQ — /api/stats : dashboard aggregates

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [total, byStatusRaw, byScriptRaw, byCategoryRaw, topRulesRaw, byDayRaw, confAgg, ecommCount] =
    await Promise.all([
      db.scan.count(),
      db.scan.groupBy({ by: ['status'], _count: true }),
      db.scan.groupBy({ by: ['scriptDetected'], _count: true }),
      db.scan.groupBy({ by: ['category'], _count: true }),
      db.finding.groupBy({ by: ['ruleId', 'ruleTitle', 'ruleRef'], where: { severity: { in: ['VIOLATION', 'MISSING'] } }, _count: true }),
      db.scan.groupBy({ by: ['createdAt'], _count: true }),
      db.scan.aggregate({ _avg: { overallConfidence: true } }),
      db.scan.count({ where: { category: 'E-commerce Listing' } }),
    ])

  // group by day (YYYY-MM-DD)
  const byDay: Record<string, number> = {}
  for (const r of byDayRaw) {
    const d = r.createdAt.toISOString().slice(0, 10)
    byDay[d] = (byDay[d] ?? 0) + r._count
  }

  return NextResponse.json({
    total,
    byStatus: Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count])),
    byScript: Object.fromEntries(byScriptRaw.map((r) => [r.scriptDetected, r._count])),
    byCategory: Object.fromEntries(byCategoryRaw.map((r) => [r.category, r._count])),
    topViolatedRules: topRulesRaw
      .sort((a, b) => b._count - a._count)
      .slice(0, 6)
      .map((r) => ({ ruleId: r.ruleId, ruleTitle: r.ruleTitle, ruleRef: r.ruleRef, count: r._count })),
    byDay,
    avgConfidence: +(confAgg._avg.overallConfidence ?? 0).toFixed(2),
    ecommerceScans: ecommCount,
  })
}

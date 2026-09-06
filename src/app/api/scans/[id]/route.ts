// LabelIQ — /api/scans/[id] : fetch single + delete

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toScanDTO } from '@/lib/server/scans'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scan = await db.scan.findFirst({ where: { id }, include: { findings: true } })
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  return NextResponse.json({ scan: toScanDTO(scan) })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scan = await db.scan.findFirst({ where: { id } })
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
  await db.scan.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

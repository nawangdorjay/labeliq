// LabelIQ — /api/findings/[id] : inspector verification (Accept / Modify / Reject)
// Human-in-the-loop layer: the legal decision is confirmed by a human, never by an LLM.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recomputeScanStatus } from '@/lib/server/scans'
import { revalidateFinding } from '@/lib/rules/engine'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const action = String(body.action ?? '')
    if (!['ACCEPT', 'MODIFY', 'REJECT'].includes(action)) {
      return NextResponse.json({ error: 'action must be ACCEPT | MODIFY | REJECT' }, { status: 400 })
    }

    const finding = await db.finding.findUnique({ where: { id } })
    if (!finding) return NextResponse.json({ error: 'Finding not found' }, { status: 404 })

    const note = body.note != null ? String(body.note).slice(0, 500) : null

    const data: Record<string, unknown> = {
      status: action,
      inspectorNote: note,
      reviewedAt: new Date(),
    }

    if (action === 'MODIFY') {
      const newValue = body.newValue != null ? String(body.newValue).trim() : null
      const re = revalidateFinding(finding.ruleId, newValue)
      data.severity = re.severity
      data.reason = re.reason
      data.extractedValue = newValue ?? finding.extractedValue
      data.reviewedValue = newValue
      data.confidence = 1 // human-confirmed
    }

    const updated = await db.finding.update({ where: { id }, data })
    await recomputeScanStatus(finding.scanId)
    return NextResponse.json({ finding: updated })
  } catch (e) {
    console.error('finding PATCH failed', e)
    return NextResponse.json({ error: 'Failed to update finding' }, { status: 500 })
  }
}

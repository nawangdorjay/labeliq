// LabelIQ — /api/scans : list (search/filter) + create (full pipeline)

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createScan, toScanDTO } from '@/lib/server/scans'
import type { FieldKey } from '@/lib/types'
import type { VlmFieldInput } from '@/lib/rules/extract'
import { FIELD_LABEL } from '@/lib/rules/synonyms'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get('q')?.trim() ?? ''
  const status = sp.get('status') ?? ''
  const category = sp.get('category') ?? ''
  const script = sp.get('script') ?? ''
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(sp.get('pageSize') ?? '10', 10)))

  const where: Record<string, unknown> = {}
  const and: Record<string, unknown>[] = []
  if (q) {
    and.push({
      OR: [
        { fileName: { contains: q } },
        { ocrText: { contains: q } },
        { languageLabel: { contains: q } },
        { findings: { some: { ruleTitle: { contains: q } } } },
      ],
    })
  }
  if (status) and.push({ status })
  if (category) and.push({ category })
  if (script) and.push({ scriptDetected: script })
  if (and.length) where.AND = and

  const [total, scans] = await Promise.all([
    db.scan.count({ where }),
    db.scan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { findings: true },
    }),
  ])

  return NextResponse.json({
    scans: scans.map(toScanDTO),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

const VALID_FIELD_KEYS = new Set<string>(Object.keys(FIELD_LABEL))

/** accept only well-formed {field, value, confidence?} entries with known field keys */
function sanitizeVlmFields(raw: unknown): VlmFieldInput[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: VlmFieldInput[] = []
  for (const f of raw as Array<{ field?: unknown; value?: unknown; confidence?: unknown }>) {
    if (typeof f?.field !== 'string' || !VALID_FIELD_KEYS.has(f.field)) continue
    if (typeof f?.value !== 'string' || !f.value.trim()) continue
    out.push({
      field: f.field as FieldKey,
      value: f.value,
      confidence: typeof f.confidence === 'number' ? f.confidence : undefined,
    })
  }
  return out.length ? out : undefined
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const scan = await createScan({
      fileName: String(body.fileName ?? 'untitled.jpg'),
      imageData: String(body.imageData ?? ''),
      ocrText: String(body.ocrText ?? ''),
      lines: Array.isArray(body.lines) ? body.lines : [],
      language: body.language ?? {
        script: 'Latin', scriptLabel: 'English (Latin)', ocrLangs: ['eng'], ratios: { Latin: 1 }, method: 'unicode', confidence: 1,
      },
      category: String(body.category ?? 'General'),
      categorySource: body.categorySource === 'auto' ? 'auto' : 'manual',
      isEcommerce: Boolean(body.isEcommerce),
      vlmFields: sanitizeVlmFields(body.vlmFields),
    })
    return NextResponse.json({ scan: toScanDTO(scan) }, { status: 201 })
  } catch (e) {
    console.error('createScan failed', e)
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }
}

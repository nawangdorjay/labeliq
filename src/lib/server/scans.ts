// LabelIQ — server-side scan helpers shared by API routes

import { db } from '@/lib/db'
import type { BBox, ExtractedField, FindingDTO, OcrLine, ScanDTO } from '@/lib/types'
import { extractFields } from '@/lib/rules/extract'
import { findingTriage, runRuleEngine } from '@/lib/rules/engine'
import { activeVersionLabel } from '@/lib/rules/repository'

export interface CreateScanPayload {
  fileName: string
  imageData: string
  ocrText: string
  lines: OcrLine[]
  language: {
    script: string
    scriptLabel: string
    ocrLangs: string[]
    ratios: Record<string, number>
    method: string
    confidence: number
  }
  category: string
  categorySource: 'auto' | 'manual'
  isEcommerce: boolean
}

export async function recomputeScanStatus(scanId: string): Promise<void> {
  const findings = await db.finding.findMany({ where: { scanId } })
  const active = findings.filter(
    (f) => (f.severity === 'VIOLATION' || f.severity === 'MISSING') && f.status !== 'REJECTED',
  )
  const pending = findings.filter((f) => f.status === 'PENDING')
  const touched = findings.some(
    (f) => f.status === 'ACCEPTED' || f.status === 'MODIFY' || f.status === 'MODIFIED' || f.status === 'REJECTED',
  )

  let status = 'PENDING_REVIEW'
  if (pending.length > 0) status = 'PENDING_REVIEW'
  else if (active.length > 0) status = 'NON_COMPLIANT'
  else status = touched ? 'REVIEWED' : 'COMPLIANT'

  await db.scan.update({ where: { id: scanId }, data: { status } })
}

export async function createScan(payload: CreateScanPayload) {
  // ---- deterministic pipeline (server side, single source of truth) ----
  const fields: ExtractedField[] = extractFields(payload.lines)
  const { findings, overallConfidence, status } = runRuleEngine({
    fields,
    lines: payload.lines,
    category: payload.category,
    isEcommerce: payload.isEcommerce,
  })

  return db.scan.create({
    data: {
      fileName: payload.fileName,
      imageData: payload.imageData,
      ocrText: payload.ocrText,
      lines: JSON.stringify(payload.lines),
      scriptDetected: payload.language.script,
      languageLabel: payload.language.scriptLabel,
      ocrLangs: payload.language.ocrLangs.join('+'),
      languageRatios: JSON.stringify(payload.language.ratios),
      detectionMethod: payload.language.method,
      category: payload.category,
      categorySource: payload.categorySource,
      ruleVersion: activeVersionLabel(),
      fields: JSON.stringify(fields),
      overallConfidence,
      status,
      findings: {
        create: findings.map((f) => ({
          ruleId: f.ruleId,
          ruleRef: f.ruleRef,
          ruleTitle: f.ruleTitle,
          ruleLayer: f.ruleLayer,
          field: f.field,
          severity: f.severity,
          extractedValue: f.extractedValue,
          expectedFormat: f.expectedFormat,
          reason: f.reason,
          confidence: f.confidence,
          evidenceBox: f.evidenceBox ? JSON.stringify(f.evidenceBox) : null,
          evidenceText: f.evidenceText,
          status: findingTriage(f),
        })),
      },
    },
    include: { findings: true },
  })
}

type ScanWithFindings = Awaited<ReturnType<typeof db.scan.findFirst>> & {
  findings: Array<NonNullable<Awaited<ReturnType<typeof db.finding.findFirst>>>>
}

export function toScanDTO(scan: ScanWithFindings): ScanDTO {
  return {
    id: scan.id,
    fileName: scan.fileName,
    imageData: scan.imageData,
    ocrText: scan.ocrText,
    lines: safeParse<OcrLine[]>(scan.lines, []),
    scriptDetected: scan.scriptDetected,
    languageLabel: scan.languageLabel,
    ocrLangs: scan.ocrLangs,
    languageRatios: safeParse<Record<string, number>>(scan.languageRatios, {}),
    detectionMethod: scan.detectionMethod,
    category: scan.category,
    categorySource: scan.categorySource,
    ruleVersion: scan.ruleVersion,
    fields: safeParse<ExtractedField[]>(scan.fields, []),
    overallConfidence: scan.overallConfidence,
    status: scan.status,
    reviewNote: scan.reviewNote,
    createdAt: scan.createdAt.toISOString(),
    updatedAt: scan.updatedAt.toISOString(),
    findings: scan.findings.map((f) => ({
      id: f.id,
      ruleId: f.ruleId,
      ruleRef: f.ruleRef,
      ruleTitle: f.ruleTitle,
      ruleLayer: f.ruleLayer,
      field: f.field,
      severity: f.severity,
      extractedValue: f.extractedValue,
      expectedFormat: f.expectedFormat,
      reason: f.reason,
      confidence: f.confidence,
      evidenceBox: f.evidenceBox ? safeParse<BBox>(f.evidenceBox, null as never) : null,
      evidenceText: f.evidenceText,
      status: f.status,
      inspectorNote: f.inspectorNote,
      reviewedAt: f.reviewedAt ? f.reviewedAt.toISOString() : null,
      reviewedValue: f.reviewedValue,
    })) satisfies FindingDTO[],
  }
}

export function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

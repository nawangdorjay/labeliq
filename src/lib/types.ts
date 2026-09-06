// LabelIQ — shared domain types

export interface BBox { x: number; y: number; w: number; h: number }

export interface OcrLine {
  text: string
  bbox: BBox
  confidence: number // 0..1
  height: number // px in processed image
}

export type FieldKey =
  | 'MANUFACTURER'
  | 'GENERIC_NAME'
  | 'NET_QTY'
  | 'MRP'
  | 'MFG_DATE'
  | 'BEST_BEFORE'
  | 'CONSUMER_CARE'
  | 'ORIGIN'
  | 'UNIT_PRICE_HINT'

export interface ExtractedField {
  field: FieldKey
  value: string | null
  raw: string
  lineIdx: number
  bbox: BBox | null
  confidence: number
  matchedSynonym: string
  /** 'ai' when this value came from the VLM fallback layer (absent = OCR) */
  source?: 'ocr' | 'ai'
}

export type Severity = 'COMPLIANT' | 'VIOLATION' | 'MISSING' | 'WARNING'

export interface RuleCheckResult {
  ruleId: string
  ruleRef: string
  ruleTitle: string
  ruleLayer: 'TEXT' | 'VISUAL' | 'CATEGORY'
  field: FieldKey | '-'
  severity: Severity
  extractedValue: string | null
  expectedFormat: string | null
  reason: string
  confidence: number
  evidenceBox: BBox | null
  evidenceText: string | null
}

export interface LanguageInfo {
  script: string // dominant script, e.g. Devanagari
  scriptLabel: string // human label, e.g. "Hindi (Devanagari) + English"
  ocrLangs: string[] // tesseract codes, e.g. ['hin', 'eng']
  ratios: Record<string, number>
  method: 'osd' | 'unicode' | 'manual'
  confidence: number
}

export interface ScanInput {
  fileName: string
  imageData: string // dataURL
  ocrText: string
  lines: OcrLine[]
  language: LanguageInfo
  category: string
  categorySource: 'auto' | 'manual'
  isEcommerce: boolean
}

export interface FindingDTO {
  id: string
  ruleId: string
  ruleRef: string
  ruleTitle: string
  ruleLayer: string
  field: string
  severity: string
  extractedValue: string | null
  expectedFormat: string | null
  reason: string
  confidence: number
  evidenceBox: BBox | null
  evidenceText: string | null
  status: string
  inspectorNote: string | null
  reviewedAt: string | null
  reviewedValue: string | null
}

export interface ScanDTO {
  id: string
  fileName: string
  imageData: string
  ocrText: string
  lines: OcrLine[]
  scriptDetected: string
  languageLabel: string
  ocrLangs: string
  languageRatios: Record<string, number>
  detectionMethod: string
  category: string
  categorySource: string
  ruleVersion: string
  fields: ExtractedField[]
  overallConfidence: number
  status: string
  reviewNote: string | null
  createdAt: string
  updatedAt: string
  findings: FindingDTO[]
}

export const SEVERITY_META: Record<Severity, { label: string; color: string; badge: string }> = {
  COMPLIANT: { label: 'Compliant', color: '#2DD4BF', badge: 'default' },
  VIOLATION: { label: 'Violation', color: '#F87171', badge: 'destructive' },
  MISSING: { label: 'Missing', color: '#FBBF24', badge: 'secondary' },
  WARNING: { label: 'Warning', color: '#FBBF24', badge: 'secondary' },
}

export const STATUS_LABEL: Record<string, string> = {
  COMPLIANT: 'Compliant',
  NON_COMPLIANT: 'Non-Compliant',
  PENDING_REVIEW: 'Pending Review',
  REVIEWED: 'Reviewed',
  AUTO: 'Auto-Confirmed',
  PENDING: 'Awaiting Review',
  ACCEPTED: 'Accepted',
  MODIFY: 'Modified',
  MODIFIED: 'Modified',
  REJECTED: 'False Positive',
}

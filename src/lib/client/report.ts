// LabelIQ — compliance report export (client-side, jsPDF)
// Evidence-backed finding report: original image, extracted fields, rule citations,
// inspector verification trail.

import type { ScanDTO } from '@/lib/types'
import { FIELD_LABEL } from '@/lib/rules/synonyms'

export async function generateScanReport(scan: ScanDTO): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 14
  let y = 0

  // ---------- header band ----------
  doc.setFillColor(11, 18, 32)
  doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(45, 212, 191)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('LabelIQ', M, 14)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Packaged Commodities Compliance Report', M, 21)
  doc.setFontSize(8)
  doc.setTextColor(180, 190, 205)
  doc.text('Legal Metrology (Packaged Commodities) Rules, 2011 + amendments', M, 27)

  y = 42
  const statusColor: Record<string, [number, number, number]> = {
    COMPLIANT: [45, 168, 91],
    NON_COMPLIANT: [220, 66, 66],
    PENDING_REVIEW: [217, 119, 6],
    REVIEWED: [45, 212, 191],
  }
  const [sr, sg, sb] = statusColor[scan.status] ?? [100, 100, 100]

  // ---------- scan metadata ----------
  doc.setTextColor(11, 18, 32)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Verdict', M, y)
  doc.setFillColor(sr, sg, sb)
  doc.setTextColor(255, 255, 255)
  doc.roundedRect(M + 18, y - 5.5, 46, 7, 1.5, 1.5, 'F')
  doc.setFontSize(9)
  doc.text(scan.status.replace('_', ' '), M + 24, y - 0.5)

  doc.setTextColor(60, 70, 85)
  doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    ['Scan ID', scan.id.slice(0, 12)],
    ['File', scan.fileName],
    ['Scanned', new Date(scan.createdAt).toLocaleString('en-IN')],
    ['Category', scan.category],
    ['Rule version', scan.ruleVersion],
    ['Language', `${scan.languageLabel} (OCR: ${scan.ocrLangs})`],
    ['Detection', `${scan.detectionMethod.toUpperCase()} · ${scan.scriptDetected} script`],
    ['Mean confidence', `${(scan.overallConfidence * 100).toFixed(0)}%`],
  ]
  y += 6
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(110, 120, 135)
    doc.text(`${k}`, M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(35, 45, 60)
    doc.text(String(v), M + 42, y)
    y += 5
    if (y > 250) break
  }

  // ---------- evidence image ----------
  try {
    const img = new Image()
    img.src = scan.imageData
    await img.decode().catch(() => undefined)
    if (img.width && img.height) {
      const iw = 60
      const ih = (img.height / img.width) * iw
      y += 2
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(11, 18, 32)
      doc.text('Package evidence', M, y)
      // right column image
      doc.addImage(scan.imageData, 'JPEG', W - M - iw, y + 3, iw, Math.min(ih, 120))
    }
  } catch { /* image optional */ }

  // ---------- extracted fields ----------
  autoTable(doc, {
    startY: Math.max(y + 6, 52),
    head: [['Field', 'Extracted value', 'OCR conf.']],
    body: (scan.fields ?? []).map((f) => [
      FIELD_LABEL[f.field as keyof typeof FIELD_LABEL] ?? f.field,
      f.value ?? '(not detected)',
      `${(f.confidence * 100).toFixed(0)}%`,
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [35, 45, 60] },
    headStyles: { fillColor: [11, 18, 32], textColor: [255, 255, 255], fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 82 }, 2: { cellWidth: 42 } },
    margin: { left: M, right: 74 },
  })

  // ---------- findings ----------
  type Row = [string, string, string, string, string]
  const body: Row[] = scan.findings.map((f) => [
    `${f.ruleTitle}\n${f.ruleRef}`,
    f.severity,
    (f.extractedValue ?? '—') + (f.reviewedValue ? `\n→ ${f.reviewedValue}` : ''),
    `${(f.confidence * 100).toFixed(0)}%`,
    f.status,
  ])

  let tableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120
  tableY += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(11, 18, 32)
  doc.text('Findings — rule citations & verification trail', M, tableY)

  autoTable(doc, {
    startY: tableY + 3,
    head: [['Rule', 'Severity', 'Extracted / corrected', 'Conf.', 'Verification']],
    body,
    theme: 'striped',
    styles: { fontSize: 7.2, cellPadding: 2, textColor: [35, 45, 60], overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 20 },
      2: { cellWidth: 52 },
      3: { cellWidth: 14 },
      4: { cellWidth: 34 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const sev = String(data.cell.raw)
        if (sev === 'VIOLATION' || sev === 'MISSING') data.cell.styles.textColor = [200, 50, 50]
        else if (sev === 'WARNING') data.cell.styles.textColor = [190, 120, 20]
        else data.cell.styles.textColor = [20, 120, 90]
      }
    },
  })

  // ---------- footer ----------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(140, 150, 165)
    doc.text('AI reads the label. Rules interpret the law. The inspector makes the final call.', M, 289)
    doc.text(`LabelIQ · SIH26034 · page ${p}/${pages}`, W - M - 52, 289)
  }

  const stamp = new Date(scan.createdAt).toISOString().slice(0, 10)
  doc.save(`LabelIQ-report-${scan.id.slice(0, 8)}-${stamp}.pdf`)
}

/** History table CSV export. */
export function exportScansCsv(scans: ScanDTO[]): void {
  const header = ['id', 'file', 'createdAt', 'category', 'language', 'script', 'status', 'confidence', 'violations', 'pending']
  const rows = scans.map((s) => [
    s.id.slice(0, 12),
    s.fileName,
    new Date(s.createdAt).toISOString(),
    s.category,
    s.languageLabel,
    s.scriptDetected,
    s.status,
    (s.overallConfidence * 100).toFixed(0) + '%',
    String(s.findings.filter((f) => (f.severity === 'VIOLATION' || f.severity === 'MISSING') && f.status !== 'REJECTED').length),
    String(s.findings.filter((f) => f.status === 'PENDING').length),
  ])
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'labeliq-history.csv'
  a.click()
  URL.revokeObjectURL(url)
}

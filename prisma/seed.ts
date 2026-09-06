// LabelIQ — seed demo data
// Run: bun prisma/seed.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// tiny synthetic label images are NOT needed for seed rows; imageData points to a
// 1px placeholder to keep the DB small. Real scans embed full evidence images.
const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

interface SeedFinding {
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
  status: string
  reviewedValue?: string | null
}

const R = {
  manufacturer: {
    ruleId: 'R-MANUFACTURER', ruleRef: 'PCR 2011, R6(1) — name & address', ruleTitle: 'Manufacturer / Packer / Importer identity with address', ruleLayer: 'TEXT', field: 'MANUFACTURER', expectedFormat: 'Name + full postal address',
  },
  generic: {
    ruleId: 'R-GENERIC-NAME', ruleRef: 'PCR 2011, R6(1) — common/generic name', ruleTitle: 'Generic / common name of the commodity', ruleLayer: 'TEXT', field: 'GENERIC_NAME', expectedFormat: 'Plain-language commodity name',
  },
  netqty: {
    ruleId: 'R-NET-QTY', ruleRef: 'PCR 2011, R6(1) / R2(l) — net quantity', ruleTitle: 'Net quantity in standard units', ruleLayer: 'TEXT', field: 'NET_QTY', expectedFormat: 'e.g. 500 g / 1 kg / 750 ml / 10 pcs',
  },
  mrp: {
    ruleId: 'R-MRP', ruleRef: 'PCR 2011, R6(1) — retail sale price (LM Act §18)', ruleTitle: 'MRP inclusive of all taxes', ruleLayer: 'TEXT', field: 'MRP', expectedFormat: '₹ / Rs. followed by amount, incl. taxes',
  },
  mfg: {
    ruleId: 'R-MFG-DATE', ruleRef: 'PCR 2011, R6(1) — month & year of manufacture', ruleTitle: 'Month and year of pre-packing / manufacture', ruleLayer: 'TEXT', field: 'MFG_DATE', expectedFormat: 'e.g. JAN 2026 / 01/2026 / 01-2026',
  },
  care: {
    ruleId: 'R-CONSUMER-CARE', ruleRef: 'PCR (Amdt 2017), R6(1) — consumer care', ruleTitle: 'Consumer care contact details', ruleLayer: 'TEXT', field: 'CONSUMER_CARE', expectedFormat: 'Phone / email / address of responsible person',
  },
  best: {
    ruleId: 'R-CAT-BEST-BEFORE', ruleRef: 'PCR 2011 — perishable & food categories', ruleTitle: 'Best before / use-by date for food categories', ruleLayer: 'CATEGORY', field: 'BEST_BEFORE', expectedFormat: 'e.g. BEST BEFORE JAN 2027',
  },
  origin: {
    ruleId: 'R-ECOMM-ORIGIN', ruleRef: 'PCR 1st Amdt 2026 — country of origin', ruleTitle: 'Country of origin on e-commerce listings', ruleLayer: 'CATEGORY', field: 'ORIGIN', expectedFormat: 'e.g. India',
  },
}

function findings(base: SeedFinding[]) { return base }

const fullOk = (conf = 0.93): SeedFinding[] =>
  findings([
    { ...R.manufacturer, severity: 'COMPLIANT', extractedValue: 'Spice Valley Foods Pvt. Ltd., Unit 4, Pune - 411019', reason: 'Declaration present: "Spice Valley Foods Pvt. Ltd., Unit 4, Pune - 411019".', confidence: conf, status: 'AUTO' },
    { ...R.generic, severity: 'COMPLIANT', extractedValue: 'Instant Soup', reason: 'Declaration present: "Instant Soup".', confidence: conf, status: 'AUTO' },
    { ...R.netqty, severity: 'COMPLIANT', extractedValue: '50 g', reason: 'Net quantity declared as "50 g" in standard units.', confidence: conf, status: 'AUTO' },
    { ...R.mrp, severity: 'COMPLIANT', extractedValue: '₹ 60.00', reason: 'MRP declared as ₹ 60.00 (parsed from "MRP ₹ 60.00").', confidence: conf, status: 'AUTO' },
    { ...R.mfg, severity: 'COMPLIANT', extractedValue: '08/2026', reason: 'Month & year of manufacture: 08/2026 (MM/YYYY).', confidence: conf, status: 'AUTO' },
    { ...R.care, severity: 'COMPLIANT', extractedValue: '1800-233-445', reason: 'Declaration present: "1800-233-445".', confidence: conf, status: 'AUTO' },
    { ...R.best, severity: 'COMPLIANT', extractedValue: '08/2027', reason: 'Best before / use-by date for food categories declared: "08/2027".', confidence: conf, status: 'AUTO' },
  ])

const noMrp = (mrpConf = 0.42): SeedFinding[] => [
  ...fullOk(0.88).slice(0, 4),
  { ...R.mrp, severity: 'MISSING', extractedValue: null, reason: 'No readable declaration found for "MRP inclusive of all taxes" on the label. Expected: Maximum Retail Price inclusive of all taxes in rupees must be printed on the package.', confidence: mrpConf, status: 'PENDING' },
  ...fullOk(0.88).slice(4),
]

async function main() {
  const count = await db.scan.count()
  if (count > 0) {
    console.log(`Seed skipped — ${count} scans already present.`)
    return
  }

  const days = 14
  const now = Date.now()
  const langs = [
    { script: 'Latin', label: 'English (Latin)', ocr: 'eng', ratios: { Latin: 1 } },
    { script: 'Devanagari', label: 'Hindi/Marathi (Devanagari) + English (Latin)', ocr: 'hin+eng', ratios: { Devanagari: 0.58, Latin: 0.42 } },
    { script: 'Tamil', label: 'Tamil + English (Latin)', ocr: 'tam+eng', ratios: { Tamil: 0.61, Latin: 0.39 } },
    { script: 'Telugu', label: 'Telugu + English (Latin)', ocr: 'tel+eng', ratios: { Telugu: 0.55, Latin: 0.45 } },
    { script: 'Bengali', label: 'Bengali/Assamese + English (Latin)', ocr: 'ben+eng', ratios: { Bengali: 0.6, Latin: 0.4 } },
  ]
  const products: [string, string, string][] = [
    ['sunflower-oil-1l.jpg', 'Edible Oil', 'Golden Drop Refined Sunflower Oil 1L'],
    ['masala-100g.jpg', 'Packaged Food', 'Spice Valley Garam Masala 100g'],
    ['biscuit-250g.jpg', 'Bakery', 'Crunch Bakes Butter Biscuits 250g'],
    ['atta-5kg.jpg', 'Packaged Food', 'Grihini Chakki Atta 5kg'],
    ['juice-1l.jpg', 'Beverages', 'FreshFizz Mixed Fruit Juice 1L'],
    ['milkpowder-500g.jpg', 'Dairy', 'Amma Dairy Milk Powder 500g'],
    ['namkeen-200g.jpg', 'Snacks', 'TastyBites Aloo Bhujia 200g'],
    ['shampoo-100ml.jpg', 'Personal Care', 'SilkFlow Shampoo 100ml'],
    ['ecom-oil-listing.jpg', 'E-commerce Listing', 'Golden Drop Oil — e-comm listing'],
  ]

  for (let d = days - 1; d >= 0; d--) {
    const perDay = d === 0 ? 3 : 2 + (d % 3 === 0 ? 1 : 0)
    for (let i = 0; i < perDay; i++) {
      const dayStart = new Date(now - d * 86400000)
      const createdAt = new Date(dayStart.getTime() - (i * 3600000 + 15 * 60000))
      const lang = langs[(d + i) % langs.length]
      const [file, category, productName] = products[(d * perDay + i) % products.length]
      const isEcomm = category === 'E-commerce Listing'

      // outcome mix: ~45% compliant, ~35% non-compliant, ~20% pending
      const roll = (d * 7 + i * 3) % 20
      let fs: SeedFinding[]
      let status: string
      let conf: number
      if (isEcomm) {
        fs = [
          ...fullOk(0.94),
          { ...R.origin, severity: 'COMPLIANT', extractedValue: 'India', reason: 'Country of origin on e-commerce listings declared: "India".', confidence: 0.95, status: 'AUTO' },
        ]
        status = 'COMPLIANT'
        conf = 0.94
      } else if (roll < 9) {
        fs = fullOk(0.9 + ((d + i) % 5) * 0.01)
        status = 'COMPLIANT'
        conf = 0.92
      } else if (roll < 16) {
        const lowConf = (d + i) % 4 === 0
        fs = noMrp(lowConf ? 0.41 : 0.93)
        status = lowConf ? 'PENDING_REVIEW' : 'NON_COMPLIANT'
        conf = lowConf ? 0.79 : 0.9
      } else {
        fs = [
          ...fullOk(0.87).slice(0, 3),
          { ...R.mrp, severity: 'VIOLATION', extractedValue: '₹ 6O.OO', reason: '"₹ 6O.OO" is not a clean rupee amount — verify the printed price is in ₹ and inclusive of all taxes. Rule: PCR 2011, R6(1).', confidence: 0.71, status: 'PENDING' },
          { ...R.care, severity: 'MISSING', extractedValue: null, reason: 'No readable declaration found for "Consumer care contact details".', confidence: 0.38, status: 'PENDING' },
          { ...R.mfg, severity: 'COMPLIANT', extractedValue: '07/2026', reason: 'Month & year of manufacture: 07/2026 (MM/YYYY).', confidence: 0.91, status: 'AUTO' },
        ]
        status = 'PENDING_REVIEW'
        conf = 0.66
      }

      // mark a few older pending ones as reviewed
      if (status === 'PENDING_REVIEW' && d >= 8) {
        for (const f of fs) {
          if (f.status === 'PENDING') {
            f.status = 'MODIFY'
            f.reviewedValue = f.ruleId === R.mrp.ruleId ? '₹ 60.00' : (f.extractedValue ?? 'Reviewed')
            f.severity = 'COMPLIANT'
            f.reason = `Inspector corrected the extracted value: "${f.reviewedValue}".`
          }
        }
        status = 'REVIEWED'
        conf = 0.9
      }

      await db.scan.create({
        data: {
          fileName: file,
          imageData: PLACEHOLDER,
          ocrText: `${productName}\nNet Quantity: 500 g\nMRP (incl. of all taxes): ₹ 120.00\n...`,
          lines: JSON.stringify([]),
          scriptDetected: lang.script,
          languageLabel: lang.label,
          ocrLangs: lang.ocr,
          languageRatios: JSON.stringify(lang.ratios),
          detectionMethod: 'osd',
          category,
          categorySource: 'auto',
          ruleVersion: 'PCR-2011 + AMD-2026-1',
          fields: JSON.stringify([]),
          overallConfidence: conf,
          status,
          createdAt,
          updatedAt: createdAt,
          findings: {
            create: fs.map((f) => ({
              ...f,
              evidenceBox: null,
              evidenceText: f.extractedValue,
              inspectorNote: f.status === 'MODIFIED' ? 'OCR misread — corrected from image' : null,
              reviewedAt: f.status !== 'AUTO' && f.status !== 'PENDING' ? createdAt : null,
            })),
          },
        },
      })
    }
  }

  const total = await db.scan.count()
  console.log(`Seeded ${total} scans.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

// LabelIQ — versioned rule repository
// Legal Metrology (Packaged Commodities) Rules, 2011 + amendments
// Each rule is deterministic: presence / format / value check on normalized fields.
// Rule versions are selectable per scan; only rules effective on the scan date are enforced.

import type { FieldKey } from '@/lib/types'

export type RuleLayer = 'TEXT' | 'VISUAL' | 'CATEGORY'
export type RuleStatus = 'ENFORCED' | 'INFORMATIVE'

export interface RuleVersion {
  id: string
  label: string
  effectiveDate: string // ISO
  description: string
}

export const RULE_VERSIONS: RuleVersion[] = [
  {
    id: 'PCR-2011',
    label: 'PCR 2011 (base)',
    effectiveDate: '2011-03-07',
    description:
      'Legal Metrology (Packaged Commodities) Rules, 2011 — mandatory declarations on every pre-packaged commodity: manufacturer/packer identity, generic name, net quantity, MRP inclusive of all taxes, month & year of manufacture, and minimum letter height for declarations.',
  },
  {
    id: 'AMD-2017',
    label: 'Amendment 2017 (consumer care)',
    effectiveDate: '2018-01-01',
    description:
      'Adds mandatory consumer care contact details (email / telephone / address of a person responsible) on the package, and extends declaration duties to e-commerce listings for packaged commodities sold online.',
  },
  {
    id: 'AMD-2026-1',
    label: '1st Amendment 2026 (e-commerce origin)',
    effectiveDate: '2026-07-01',
    description:
      'Country of origin must be declared on e-commerce listings of packaged commodities, and platforms must expose it as a searchable & sortable filter (effective 1 July 2026).',
  },
  {
    id: 'AMD-2026-2',
    label: '2nd & 3rd Amendments 2026 (2026 package)',
    effectiveDate: '2026-08-01',
    description:
      '2026 consolidation: digital disclosure duties for platform listings and strengthened enforcement records. Loaded as INFORMATIVE entries in this deployment — tracked for awareness, not auto-enforced pending full gazette ingestion.',
  },
]

export interface Rule {
  id: string
  version: string // RULE_VERSIONS id this rule appeared in
  ref: string // legal citation shown to the inspector
  title: string
  layer: RuleLayer
  status: RuleStatus
  field: FieldKey | '-'
  appliesTo?: string[] // categories; undefined = all
  ecommerceOnly?: boolean
  expectedFormat?: string
  check: 'PRESENCE' | 'FORMAT' | 'VALUE' | 'GEOMETRY' | 'INFO'
  hint: string // what the inspector should see
}

export const RULES: Rule[] = [
  // ---------- TEXT layer: PCR 2011 base ----------
  {
    id: 'R-MANUFACTURER',
    version: 'PCR-2011',
    ref: 'PCR 2011, R6(1) — name & address',
    title: 'Manufacturer / Packer / Importer identity with address',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'MANUFACTURER',
    check: 'PRESENCE',
    expectedFormat: 'Name + full postal address',
    hint: 'Name and complete address of manufacturer, packer or importer must appear on the package.',
  },
  {
    id: 'R-GENERIC-NAME',
    version: 'PCR-2011',
    ref: 'PCR 2011, R6(1) — common/generic name',
    title: 'Generic / common name of the commodity',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'GENERIC_NAME',
    check: 'PRESENCE',
    expectedFormat: 'Plain-language commodity name',
    hint: 'The commodity inside the package must be identified by its generic name.',
  },
  {
    id: 'R-NET-QTY',
    version: 'PCR-2011',
    ref: 'PCR 2011, R6(1) / R2(l) — net quantity',
    title: 'Net quantity in standard units',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'NET_QTY',
    check: 'FORMAT',
    expectedFormat: 'e.g. 500 g / 1 kg / 750 ml / 10 pcs',
    hint: 'Net quantity must be declared in weight, volume, length, area or number with the correct symbol.',
  },
  {
    id: 'R-MRP',
    version: 'PCR-2011',
    ref: 'PCR 2011, R6(1) — retail sale price (LM Act §18)',
    title: 'MRP inclusive of all taxes',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'MRP',
    check: 'FORMAT',
    expectedFormat: '₹ / Rs. followed by amount, incl. taxes',
    hint: 'Maximum Retail Price inclusive of all taxes in rupees must be printed on the package.',
  },
  {
    id: 'R-MFG-DATE',
    version: 'PCR-2011',
    ref: 'PCR 2011, R6(1) — month & year of manufacture',
    title: 'Month and year of pre-packing / manufacture',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'MFG_DATE',
    check: 'FORMAT',
    expectedFormat: 'e.g. JAN 2026 / 01/2026 / 01-2026',
    hint: 'The month and year in which the commodity was manufactured or pre-packed.',
  },
  // ---------- TEXT layer: 2017 amendment ----------
  {
    id: 'R-CONSUMER-CARE',
    version: 'AMD-2017',
    ref: 'PCR (Amdt 2017), R6(1) — consumer care',
    title: 'Consumer care contact details',
    layer: 'TEXT',
    status: 'ENFORCED',
    field: 'CONSUMER_CARE',
    check: 'PRESENCE',
    expectedFormat: 'Phone / email / address of responsible person',
    hint: 'A consumer-care contact (name, telephone, email or address) must be printed on the package.',
  },
  // ---------- TEXT layer: 1st 2026 amendment ----------
  {
    id: 'R-ECOMM-ORIGIN',
    version: 'AMD-2026-1',
    ref: 'PCR 1st Amdt 2026 — country of origin',
    title: 'Country of origin on e-commerce listings',
    layer: 'CATEGORY',
    status: 'ENFORCED',
    field: 'ORIGIN',
    ecommerceOnly: true,
    check: 'PRESENCE',
    expectedFormat: 'e.g. India',
    hint: 'Listings of packaged commodities on e-commerce platforms must declare country of origin as a searchable, sortable attribute (eff. 1 Jul 2026).',
  },
  // ---------- CATEGORY layer ----------
  {
    id: 'R-CAT-BEST-BEFORE',
    version: 'PCR-2011',
    ref: 'PCR 2011 — perishable & food categories',
    title: 'Best before / use-by date for food categories',
    layer: 'CATEGORY',
    status: 'ENFORCED',
    field: 'BEST_BEFORE',
    appliesTo: ['Bakery', 'Beverages', 'Dairy', 'Edible Oil', 'Snacks', 'Packaged Food'],
    check: 'PRESENCE',
    expectedFormat: 'e.g. BEST BEFORE JAN 2027',
    hint: 'For the selected food category a best-before / use-by declaration is expected alongside the LMPC mandatory set.',
  },
  {
    id: 'R-CAT-UNIT-PRICE',
    version: 'PCR-2011',
    ref: 'PCR 2011 — multi-unit packages',
    title: 'Unit-level MRP for multi-unit packages',
    layer: 'CATEGORY',
    status: 'ENFORCED',
    field: 'UNIT_PRICE_HINT',
    appliesTo: ['Multi-pack'],
    check: 'INFO',
    hint: 'When a package contains multiple units, MRP per unit (and per pack) is expected; verify the per-unit declaration is present.',
  },
  // ---------- 2026 package (INFORMATIVE) ----------
  {
    id: 'R-ECOMM-FILTER',
    version: 'AMD-2026-2',
    ref: 'PCR 2026 package — platform duty',
    title: 'Origin exposed as searchable / sortable filter',
    layer: 'CATEGORY',
    status: 'INFORMATIVE',
    field: 'ORIGIN',
    ecommerceOnly: true,
    check: 'INFO',
    hint: 'Platform-side duty: country of origin must be a filterable attribute. Checklist item for platform audits — not auto-enforced on the label image.',
  },
  {
    id: 'R-DIGITAL-DISCLOSURE',
    version: 'AMD-2026-2',
    ref: 'PCR 2026 package — digital disclosure',
    title: 'QR / digital link disclosure tracking',
    layer: 'TEXT',
    status: 'INFORMATIVE',
    field: '-',
    check: 'INFO',
    hint: 'Digital (QR-linked) disclosures are entering the rulebook. Logged for awareness; enforcement pending full gazette ingestion.',
  },
  // ---------- VISUAL layer (heuristic proxies on OCR geometry) ----------
  {
    id: 'R-VIS-LETTER-HEIGHT',
    version: 'PCR-2011',
    ref: 'PCR 2011 — size of letters & numerals',
    title: 'Minimum declaration letter height (proxy)',
    layer: 'VISUAL',
    status: 'ENFORCED',
    field: '-',
    check: 'GEOMETRY',
    hint: 'Declarations must meet the minimum height of letters and numerals (≥1.6 mm for small packages). This is a computed proxy from OCR geometry — route to manual check on warning.',
  },
  {
    id: 'R-VIS-READABILITY',
    version: 'PCR-2011',
    ref: 'PCR 2011 — legible & prominent marking',
    title: 'Legibility / contrast of declarations',
    layer: 'VISUAL',
    status: 'ENFORCED',
    field: '-',
    check: 'GEOMETRY',
    hint: 'Declarations must be legible and prominent against the background. Low OCR confidence across the label indicates low-contrast print — route to manual check.',
  },
]

/** Active composite version label for a given scan date. */
export function activeVersionLabel(scanDate = new Date()): string {
  const active = RULE_VERSIONS.filter((v) => new Date(v.effectiveDate) <= scanDate)
  const last = active[active.length - 1]
  if (!last || last.id === 'PCR-2011') return 'PCR-2011'
  if (last.id.startsWith('AMD-2026')) return 'PCR-2011 + Amdt-2017 + 2026 Amdts'
  return `PCR-2011 + ${last.id}`
}

/** Rules effective for a scan: right version scope + category scope. */
export function applicableRules(
  category: string,
  isEcommerce: boolean,
  scanDate = new Date(),
): Rule[] {
  return RULES.filter((rule) => {
    const ver = RULE_VERSIONS.find((v) => v.id === rule.version)!
    if (new Date(ver.effectiveDate) > scanDate) return false
    if (rule.ecommerceOnly && !isEcommerce) return false
    if (rule.appliesTo && !rule.appliesTo.includes(category)) return false
    return true
  })
}

export const CATEGORIES = [
  'General',
  'Packaged Food',
  'Bakery',
  'Beverages',
  'Dairy',
  'Edible Oil',
  'Snacks',
  'Personal Care',
  'Multi-pack',
  'E-commerce Listing',
] as const

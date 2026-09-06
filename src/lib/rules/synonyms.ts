// LabelIQ — multilingual field synonym dictionary
// Normalization layer: MRP / Maximum Retail Price / अधिकतम खुदरा मूल्य → FIELD: MRP
// Sources: common label wording across English/Hindi/Marathi/Tamil/Telugu/Bengali packaged goods

import type { FieldKey } from '@/lib/types'

export interface FieldSyn {
  field: FieldKey
  label: string
  synonyms: string[] // matched case-insensitively anywhere in a line
  valueHint?: string
}

export const FIELD_SYNONYMS: FieldSyn[] = [
  {
    field: 'MRP',
    label: 'Maximum Retail Price',
    synonyms: [
      'MRP', 'M.R.P', 'M R P', 'maximum retail price', 'retail price', 'retail sale price',
      'अधिकतम खुदरा मूल्य', 'अधिकतम मूल्य', 'खुदरा मूल्य', 'विक्रय मूल्य', 'अ.कि.मू.',
    ],
    valueHint: '₹ 120.00',
  },
  {
    field: 'NET_QTY',
    label: 'Net Quantity',
    synonyms: [
      'net quantity', 'net wt', 'net weight', 'net mass', 'net content', 'contains', 'net',
      'निवल मात्रा', 'निवल भार', 'शुद्ध तौल', 'शुद्ध मात्रा', 'मात्रा',
    ],
    valueHint: '500 g',
  },
  {
    field: 'MFG_DATE',
    label: 'Month & Year of Manufacture',
    synonyms: [
      'mfg', 'mfg date', 'manufactured', 'manufacture date', 'date of manufacture', 'date of mfg',
      'month & year of manufacture', 'year of manufacture', 'manufacture',
      'निर्माण तिथि', 'निर्माण माह', 'निर्माण', 'माह एवं वर्ष',
    ],
    valueHint: 'JAN 2026',
  },
  {
    field: 'BEST_BEFORE',
    label: 'Best Before / Use By',
    synonyms: [
      'best before', 'best if used before', 'use by', 'use before', 'expiry', 'exp date', 'exp.',
      'बेहतर तक', 'से पहले उपयोग', 'खराब होने से पूर्व', 'व्यवहार्यता',
    ],
    valueHint: 'JAN 2027',
  },
  {
    field: 'MANUFACTURER',
    label: 'Manufacturer / Packer / Importer',
    synonyms: [
      'manufactured by', 'marketed by', 'packed by', 'mfd', 'mfd. by', 'importer', 'imported by',
      'निर्माता', 'पैकर', 'आयातक', 'निर्मित',
    ],
    valueHint: 'Name & full address',
  },
  {
    field: 'GENERIC_NAME',
    label: 'Generic / Common Name',
    synonyms: ['generic name', 'common name', 'name of the product', 'product name', 'commodity'],
    valueHint: 'e.g. Instant Noodles',
  },
  {
    field: 'CONSUMER_CARE',
    label: 'Consumer Care Details',
    synonyms: [
      'consumer care', 'consumer care contact', 'consumer complaints', 'toll free', 'toll-free',
      'customer care', 'helpline', 'उपभोक्ता सेवा', 'उपभोक्ता देखभाल', 'टोल फ्री',
    ],
    valueHint: 'Phone / email / address',
  },
  {
    field: 'ORIGIN',
    label: 'Country of Origin',
    synonyms: [
      'country of origin', 'origin', 'made in', 'मूल देश', 'उत्पत्ति का देश',
    ],
    valueHint: 'e.g. India',
  },
  {
    field: 'UNIT_PRICE_HINT',
    label: 'MRP per unit (multi-pack)',
    synonyms: ['mrp per', 'per unit', 'per piece', 'per pack', 'inclusive of all taxes'],
    valueHint: '₹ per unit',
  },
]

/** Find which field a line refers to (highest-priority synonym hit). */
export function matchField(line: string): { field: FieldKey; synonym: string } | null {
  const l = line.toLowerCase()
  let best: { field: FieldKey; synonym: string; idx: number; len: number } | null = null
  for (const fs of FIELD_SYNONYMS) {
    for (const syn of fs.synonyms) {
      const idx = l.indexOf(syn.toLowerCase())
      if (idx >= 0) {
        // prefer longer synonym hits (reduces false positives like 'net' vs 'net quantity')
        if (!best || syn.length > best.len) best = { field: fs.field, synonym: syn, idx, len: syn.length }
      }
    }
  }
  if (best) return { field: best.field, synonym: best.synonym }
  return null
}

export const FIELD_LABEL: Record<FieldKey, string> = Object.fromEntries(
  FIELD_SYNONYMS.map((f) => [f.field, f.label]),
) as Record<FieldKey, string>

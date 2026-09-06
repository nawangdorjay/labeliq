// LabelIQ — /api/health : deployment verification endpoint.
//
// GET → { ok, version, buildDate, features, ai, db }
// Lets anyone (user, judge, monitor) confirm WHICH version is live and
// whether the AI layer is configured — without exposing any secrets.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { APP_VERSION, BUILD_DATE, FEATURES } from '@/lib/version'
import { activeProviders } from '@/lib/ai/providers'

export const runtime = 'nodejs'
// always fresh — this is a version/status probe
export const dynamic = 'force-dynamic'

export async function GET() {
  let scanCount: number | null = null
  try {
    scanCount = await db.scan.count()
  } catch {
    scanCount = null
  }

  const providers = activeProviders()

  return NextResponse.json(
    {
      ok: true,
      app: 'LabelIQ',
      problemStatement: 'SIH26034',
      version: APP_VERSION,
      buildDate: BUILD_DATE,
      features: FEATURES,
      ai: {
        live: providers.length > 0,
        providers: providers.map((p) => ({ id: p.id, label: p.label, model: p.model })),
        byokSupported: true,
      },
      db: {
        engine: 'SQLite',
        scans: scanCount,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

// LabelIQ — /api/ai/unlock : exchange the AI access password for a session token.
//
// POST { password }
//   200 → { token }        (store client-side for this session; send as x-ai-token)
//   401 → { error }        wrong password
//   429 → { error }        too many wrong attempts (best-effort, per warm
//                          serverless instance — retry in a few minutes)
//
// The token lets /api/ai/extract use the SERVER's provider keys (Vercel env
// secrets) instead of the user's own BYOK keys. Changing AI_ACCESS_PASSWORD
// in the environment instantly rotates every token.

import { NextRequest, NextResponse } from 'next/server'
import { aiAccessToken, checkAiPassword, clearFailures, isLockedOut, recordFailure } from '@/lib/ai/access'

export const runtime = 'nodejs'

function clientKey(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  )
}

export async function POST(req: NextRequest) {
  const key = clientKey(req)

  if (isLockedOut(key)) {
    return NextResponse.json(
      { error: 'Too many wrong attempts — wait a few minutes and try again' },
      { status: 429, headers: { 'retry-after': '300' } },
    )
  }

  let password = ''
  try {
    const body = await req.json()
    if (typeof body?.password === 'string') password = body.password
  } catch {
    return NextResponse.json({ error: 'password (string) is required' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: 'password (string) is required' }, { status: 400 })
  }

  if (!checkAiPassword(password)) {
    recordFailure(key)
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  clearFailures(key)
  return NextResponse.json(
    { token: aiAccessToken(), keySource: 'server' as const },
    { headers: { 'cache-control': 'no-store' } },
  )
}

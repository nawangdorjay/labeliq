import { PrismaClient } from '@prisma/client'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Vercel/serverless: the bundle filesystem is read-only and ephemeral, and each
// container starts with an empty /tmp. SQLite therefore lives in /tmp, freshly
// seeded from the committed demo snapshot (db/seed.db) on first boot of a
// container. Warm containers keep their data; local dev is unaffected and keeps
// using DATABASE_URL from .env.
function prepareServerlessDb(): void {
  if (!process.env.VERCEL) return
  const target = join('/tmp', 'labeliq', 'custom.db')
  if (!existsSync(target)) {
    mkdirSync(join('/tmp', 'labeliq'), { recursive: true })
    const candidates = [
      join(process.cwd(), 'db', 'seed.db'),
      join(process.cwd(), '..', 'db', 'seed.db'),
    ]
    const seed = candidates.find((p) => existsSync(p))
    if (seed) copyFileSync(seed, target)
  }
  process.env.DATABASE_URL = `file:${target}`
}

prepareServerlessDb()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// Name similarity score: returns 0-1. Higher = better match.
function nameSimilarity(a: string, b: string): number {
  a = a.toLowerCase().trim()
  b = b.toLowerCase().trim()
  if (a === b) return 1
  if (b.includes(a) || a.includes(b)) return 0.9
  const wa = new Set(a.split(/\s+/))
  const wb = b.split(/\s+/)
  const common = wb.filter(w => wa.has(w)).length
  if (common > 0) return 0.5 + (common / Math.max(wa.size, wb.length)) * 0.4
  return 0
}

// Combined score: name similarity * 0.6 + popularity (log-normalized) * 0.4
function score(stagingName: string, dbName: string, quoteCount: number, maxQuotes: number): number {
  const sim = nameSimilarity(stagingName, dbName)
  if (sim === 0) return 0
  const popularity = maxQuotes > 0 ? Math.log1p(quoteCount) / Math.log1p(maxQuotes) : 0
  return sim * 0.6 + popularity * 0.4
}

function isAuthed(req: NextRequest, session: Awaited<ReturnType<typeof auth>>) {
  if (req.headers.get('x-internal-secret') === process.env.INTERNAL_API_SECRET) return true
  return (session?.user as { role?: string })?.role === 'ADMIN'
}

// GET — returns unique staging speaker names + best DB match for each
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAuthed(req, session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episodeId = parseInt(id)

  const episode = await prisma.stagingEpisode.findUnique({
    where: { id: episodeId },
    select: { showId: true },
  })
  if (!episode) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [stagingQuotes, dbSpeakers] = await Promise.all([
    prisma.stagingQuote.findMany({ where: { stagingEpisodeId: episodeId }, select: { speaker: true } }),
    prisma.speaker.findMany({
      where: { showId: episode.showId },
      select: { id: true, name: true, _count: { select: { quotes: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  const maxQuotes = Math.max(...dbSpeakers.map(s => s._count.quotes), 1)
  const unique = [...new Set(stagingQuotes.map(q => q.speaker.trim()).filter(Boolean))]

  const mappings = unique.map(stagingName => {
    if (dbSpeakers.length === 0) return { stagingName, suggestedName: null, suggestedScore: 0 }
    const scored = dbSpeakers.map(s => ({
      ...s,
      score: score(stagingName, s.name, s._count.quotes, maxQuotes),
    }))
    scored.sort((a, b) => b.score - a.score || b._count.quotes - a._count.quotes)
    const best = scored[0]
    return {
      stagingName,
      suggestedName: best.score >= 0.3 ? best.name : null,
      suggestedScore: best.score,
    }
  })

  return NextResponse.json({ mappings, speakers: dbSpeakers.map(s => ({ id: s.id, name: s.name })) })
}

// POST — bulk-update staging quote speaker names using provided mapping
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAuthed(req, session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const episodeId = parseInt(id)
  const { mapping } = await req.json() as { mapping: Record<string, string> }

  // Bulk update: for each staging name → mapped name, update all quotes
  for (const [from, to] of Object.entries(mapping)) {
    if (from === to || !to) continue
    await prisma.stagingQuote.updateMany({
      where: { stagingEpisodeId: episodeId, speaker: from },
      data: { speaker: to },
    })
  }

  return NextResponse.json({ ok: true })
}

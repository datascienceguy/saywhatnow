import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function buildFtsQuery(raw: string): string {
  const sanitized = raw.replace(/["*^()]/g, ' ').replace(/\s+/g, ' ').trim()
  return `"${sanitized}"`
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const showId = req.nextUrl.searchParams.get('showId')
  const speakerId = req.nextUrl.searchParams.get('speakerId')
  const season = req.nextUrl.searchParams.get('season')

  if (q.length < 2) return NextResponse.json([])

  const baseFilter = {
    ...(speakerId ? { speakerId: Number(speakerId) } : {}),
    ...(showId || season ? {
      episode: {
        ...(showId ? { showId: Number(showId) } : {}),
        ...(season ? { season: Number(season) } : {}),
      }
    } : {}),
  }

  const ftsResults = await prisma.$queryRaw<{ rowid: bigint }[]>`
    SELECT rowid FROM quotes_fts WHERE quotes_fts MATCH ${buildFtsQuery(q)}
  `
  if (ftsResults.length === 0) return NextResponse.json([])

  const quoteIds = ftsResults.map(r => Number(r.rowid))
  const rows = await prisma.quote.findMany({
    where: { id: { in: quoteIds }, ...baseFilter },
    select: { clipId: true },
    distinct: ['clipId'],
  })
  const clipIds = rows.map(r => r.clipId)
  if (clipIds.length === 0) return NextResponse.json([])

  const highlightTerms = q.toUpperCase().replace(/["*^()]/g, ' ').split(/\s+/).filter(t => t.length > 0)

  const clips = await prisma.clip.findMany({
    where: { id: { in: clipIds } },
    include: {
      episode: { include: { show: true } },
      quotes: { include: { speaker: true }, orderBy: { sequence: 'asc' } },
    },
    orderBy: [
      { episode: { season: 'asc' } },
      { episode: { episodeNumber: 'asc' } },
      { id: 'asc' },
    ],
    take: 30,
  })

  const results = clips.map(clip => ({
    ...clip,
    quotes: clip.quotes.map(quote => ({
      ...quote,
      isMatch: highlightTerms.some(t => quote.text.toUpperCase().includes(t)),
    })),
    highlightTerms,
  }))

  return NextResponse.json(results)
}

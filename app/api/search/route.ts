import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const showId = req.nextUrl.searchParams.get('showId')
  const speakerId = req.nextUrl.searchParams.get('speakerId')
  const season = req.nextUrl.searchParams.get('season')

  if (q.length < 2) return NextResponse.json([])

  // Find quotes matching the search text
  const quotes = await prisma.quote.findMany({
    where: {
      text: { contains: q },
      ...(speakerId ? { speakerId: Number(speakerId) } : {}),
      ...(showId || season ? {
        episode: {
          ...(showId ? { showId: Number(showId) } : {}),
          ...(season ? { season: Number(season) } : {}),
        }
      } : {}),
    },
    select: { clipId: true },
    distinct: ['clipId'],
    take: 30,
  })

  if (quotes.length === 0) return NextResponse.json([])

  // For each matching clip, fetch the full clip context (all quotes in that clip)
  const clipIds = quotes.map(q => q.clipId)
  const clips = await prisma.clip.findMany({
    where: { id: { in: clipIds } },
    include: {
      episode: { include: { show: true } },
      quotes: {
        include: { speaker: true },
        orderBy: { sequence: 'asc' },
      },
    },
    orderBy: [
      { episode: { season: 'asc' } },
      { episode: { episodeNumber: 'asc' } },
      { id: 'asc' },
    ],
  })

  // Mark which quotes matched the search term
  const lowerQ = q.toLowerCase()
  const results = clips.map(clip => ({
    ...clip,
    quotes: clip.quotes.map(quote => ({
      ...quote,
      isMatch: quote.text.toLowerCase().includes(lowerQ),
    })),
  }))

  return NextResponse.json(results)
}

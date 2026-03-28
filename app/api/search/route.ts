import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseSearchQuery, getHighlightTerms } from '@/lib/search'

function quoteMatchesToken(text: string, token: { value: string; exact: boolean }): boolean {
  const upper = text.toUpperCase()
  const val = token.value
  const idx = upper.indexOf(val)
  if (idx === -1) return false
  if (token.exact) return true
  const before = idx === 0 ? ' ' : upper[idx - 1]
  const after = idx + val.length >= upper.length ? ' ' : upper[idx + val.length]
  return !/[A-Z0-9']/.test(before) && !/[A-Z0-9']/.test(after)
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const showId = req.nextUrl.searchParams.get('showId')
  const speakerId = req.nextUrl.searchParams.get('speakerId')
  const season = req.nextUrl.searchParams.get('season')

  const tokens = q.length >= 2 ? parseSearchQuery(q) : []
  const includeTokens = tokens.filter(t => t.type === 'include')
  const excludeTokens = tokens.filter(t => t.type === 'exclude')

  if (includeTokens.length === 0) return NextResponse.json([])

  const baseFilter = {
    ...(speakerId ? { speakerId: Number(speakerId) } : {}),
    ...(showId || season ? {
      episode: {
        ...(showId ? { showId: Number(showId) } : {}),
        ...(season ? { season: Number(season) } : {}),
      }
    } : {}),
  }

  let clipIdSet: Set<number> | null = null
  for (const token of includeTokens) {
    const rows = await prisma.quote.findMany({
      where: { ...baseFilter, text: { contains: token.value } },
      select: { clipId: true, text: true },
      distinct: ['clipId'],
    })
    const ids = new Set(rows.filter(r => quoteMatchesToken(r.text, token)).map(r => r.clipId))
    if (clipIdSet === null) { clipIdSet = ids } else { const prev: Set<number> = clipIdSet; clipIdSet = new Set([...prev].filter(id => ids.has(id))) }
    if (clipIdSet.size === 0) break
  }

  for (const token of excludeTokens) {
    if (!clipIdSet || clipIdSet.size === 0) break
    const rows = await prisma.quote.findMany({
      where: { text: { contains: token.value } },
      select: { clipId: true, text: true },
    })
    const excludedIds = new Set(rows.filter(r => quoteMatchesToken(r.text, token)).map(r => r.clipId))
    clipIdSet = new Set([...clipIdSet].filter(id => !excludedIds.has(id)))
  }

  if (!clipIdSet || clipIdSet.size === 0) return NextResponse.json([])

  const clips = await prisma.clip.findMany({
    where: { id: { in: [...clipIdSet] } },
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

  const highlightTerms = getHighlightTerms(tokens)
  const results = clips.map(clip => ({
    ...clip,
    quotes: clip.quotes.map(quote => ({
      ...quote,
      isMatch: includeTokens.some(t => quoteMatchesToken(quote.text, t)),
    })),
    highlightTerms,
  }))

  return NextResponse.json(results)
}
